import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { loadServerConfig } from '@battler/server-kit';
import { devnetMarket, mockCards } from '@battler/repositories';
import { getEffectiveDasSettings } from '@battler/ingest';

const LAMPORTS_PER_SOL = 1_000_000_000;

export interface VerifyTransferResult {
  ok: boolean;
  lamports: number;
  reason?: string;
}

/** Confirm a devnet SOL payment from buyer → treasury. */
export async function verifySolTransfer(
  connection: Connection,
  opts: { signature: string; from: string; to: string; minLamports: number },
): Promise<VerifyTransferResult> {
  // Devnet routinely takes longer than the wallet's 30s window to surface a
  // transaction at the 'confirmed' commitment. Poll for it (~20s) instead of
  // giving up after a single lookup, so a real (already-paid) purchase still
  // gets credited rather than reported as "payment not found".
  let tx: Awaited<ReturnType<Connection['getTransaction']>> = null;
  let lastReason: string | undefined;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      tx = await connection.getTransaction(opts.signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
    } catch (e) {
      lastReason = e instanceof Error ? e.message : 'RPC error';
    }
    if (tx) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!tx) {
    return { ok: false, lamports: 0, reason: lastReason ?? 'Transaction not yet confirmed — try again in a moment' };
  }
  if (tx.meta?.err) return { ok: false, lamports: 0, reason: 'Transaction failed on-chain' };

  const keys = tx.transaction.message.getAccountKeys();
  const idxOf = (pk: string): number => {
    for (let i = 0; i < keys.length; i++) if (keys.get(i)?.toBase58() === pk) return i;
    return -1;
  };
  if (keys.get(0)?.toBase58() !== opts.from) {
    return { ok: false, lamports: 0, reason: 'Payment not signed by the expected wallet' };
  }
  const toIdx = idxOf(opts.to);
  if (toIdx === -1) return { ok: false, lamports: 0, reason: 'Treasury was not a recipient' };

  const pre = tx.meta?.preBalances ?? [];
  const post = tx.meta?.postBalances ?? [];
  const received = (post[toIdx] ?? 0) - (pre[toIdx] ?? 0);
  if (received < opts.minLamports) {
    return { ok: false, lamports: received, reason: `Under-funded: received ${received} < ${opts.minLamports}` };
  }
  return { ok: true, lamports: received };
}

export async function buildDevnetBuyTx(listingId: string, buyer: string) {
  const eff = await getEffectiveDasSettings();
  if (eff.mode !== 'devnet') {
    throw Object.assign(new Error('Devnet purchases only available in devnet mode'), { code: 'wrong_mode' });
  }
  const cfg = loadServerConfig();
  if (!cfg.treasuryWallet) {
    throw Object.assign(new Error('Treasury wallet not configured'), { code: 'no_treasury' });
  }
  if (!eff.heliusDevnetRpcUrl && !eff.activeRpcUrl) {
    throw Object.assign(new Error('Devnet RPC not configured'), { code: 'no_rpc' });
  }

  const listing = await devnetMarket.getListing(listingId);
  if (!listing) throw Object.assign(new Error('Listing not found'), { code: 'not_found' });
  if (listing.stockRemaining <= 0) {
    throw Object.assign(new Error('This card is sold out'), { code: 'sold_out' });
  }

  const connection = new Connection(eff.activeRpcUrl!, 'confirmed');
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction({
    feePayer: new PublicKey(buyer),
    blockhash,
    lastValidBlockHeight,
  }).add(
    SystemProgram.transfer({
      fromPubkey: new PublicKey(buyer),
      toPubkey: new PublicKey(cfg.treasuryWallet),
      lamports: listing.priceLamports,
    }),
  );

  const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  return {
    txBase64: Buffer.from(serialized).toString('base64'),
    versioned: false,
    priceLamports: listing.priceLamports,
    priceSol: Math.round((listing.priceLamports / LAMPORTS_PER_SOL) * 1000) / 1000,
    listingId,
    listingName: listing.name,
  };
}

export async function confirmDevnetPurchase(input: {
  listingId: string;
  buyer: string;
  signature: string;
}) {
  const eff = await getEffectiveDasSettings();
  if (eff.mode !== 'devnet') {
    throw Object.assign(new Error('Devnet purchases only available in devnet mode'), { code: 'wrong_mode' });
  }
  const cfg = loadServerConfig();
  if (!cfg.treasuryWallet) {
    throw Object.assign(new Error('Treasury wallet not configured'), { code: 'no_treasury' });
  }

  if (await devnetMarket.purchaseExists(input.signature)) {
    throw Object.assign(new Error('Purchase already processed'), { code: 'duplicate' });
  }

  const listing = await devnetMarket.getListing(input.listingId);
  if (!listing) throw Object.assign(new Error('Listing not found'), { code: 'not_found' });
  if (listing.stockRemaining <= 0) {
    throw Object.assign(new Error('This card is sold out'), { code: 'sold_out' });
  }

  const connection = new Connection(eff.activeRpcUrl!, 'confirmed');
  const verified = await verifySolTransfer(connection, {
    signature: input.signature,
    from: input.buyer,
    to: cfg.treasuryWallet,
    minLamports: listing.priceLamports,
  });
  if (!verified.ok) {
    throw Object.assign(new Error(verified.reason ?? 'Payment verification failed'), { code: 'bad_payment' });
  }

  const assetId = `devnet_${input.listingId}_${input.buyer.slice(0, 8)}_${Date.now()}`;
  const purchased = await devnetMarket.recordPurchase({
    listingId: input.listingId,
    buyerPubkey: input.buyer,
    assetId,
    txSignature: input.signature,
    lamports: verified.lamports,
  });
  if (!purchased) {
    throw Object.assign(new Error('Sold out — stock was claimed by another buyer'), { code: 'sold_out' });
  }

  await mockCards.add({
    ownerPubkey: input.buyer,
    name: listing.name,
    attributes: listing.attributes,
    image: listing.image,
    assetId,
  });

  return { assetId, name: listing.name, stockRemaining: purchased.stockRemaining };
}
