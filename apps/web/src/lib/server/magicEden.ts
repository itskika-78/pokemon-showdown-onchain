/**
 * Magic Eden buy integration. Reading a token's listing is keyless; building the
 * actual buy transaction requires an API key (`MAGICEDEN_API_KEY`). The returned
 * transaction is signed by the buyer's wallet client-side, so they receive the
 * real cNFT — we never custody anything.
 */
import { loadServerConfig } from '@battler/server-kit';

const ME_API = 'https://api-mainnet.magiceden.dev/v2';

export interface MeListing {
  tokenMint: string;
  tokenATA: string;
  seller: string;
  auctionHouse: string;
  price: number;
  sellerReferral: string;
  sellerExpiry: number;
}

async function meFetch(path: string, withKey = false): Promise<Response> {
  const cfg = loadServerConfig();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (withKey && cfg.magicEdenApiKey) headers.Authorization = `Bearer ${cfg.magicEdenApiKey}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  return fetch(`${ME_API}${path}`, { headers, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

/** The cheapest active listing for a token mint, or null if not listed. */
export async function getListing(mint: string): Promise<MeListing | null> {
  try {
    const res = await meFetch(`/tokens/${encodeURIComponent(mint)}/listings`);
    if (!res.ok) return null;
    const rows = (await res.json()) as Record<string, unknown>[];
    const best = rows
      .filter((r) => typeof r.price === 'number')
      .sort((a, b) => (a.price as number) - (b.price as number))[0];
    if (!best) return null;
    return {
      tokenMint: String(best.tokenMint ?? mint),
      tokenATA: String(best.tokenAddress ?? ''),
      seller: String(best.seller ?? ''),
      auctionHouse: String(best.auctionHouse ?? ''),
      price: best.price as number,
      sellerReferral: String(best.sellerReferral ?? ''),
      sellerExpiry: typeof best.expiry === 'number' ? (best.expiry as number) : -1,
    };
  } catch {
    return null;
  }
}

export interface BuyTxResult {
  /** base64-encoded (versioned or legacy) transaction for the wallet to sign. */
  txBase64: string;
  versioned: boolean;
  price: number;
}

/**
 * Build a Magic Eden `buy_now` transaction for `mint`, payable by `buyer`.
 * Returns a serialized tx the client signs. Throws a tagged Error on the known
 * failure modes so the route can map them to clean HTTP statuses.
 */
export async function buildBuyTx(mint: string, buyer: string): Promise<BuyTxResult> {
  const cfg = loadServerConfig();
  if (!cfg.magicEdenApiKey) {
    throw Object.assign(new Error('Magic Eden API key not configured'), { code: 'no_key' });
  }
  const listing = await getListing(mint);
  if (!listing) throw Object.assign(new Error('This card is not currently listed on Magic Eden'), { code: 'not_listed' });

  const qs = new URLSearchParams({
    buyer,
    seller: listing.seller,
    auctionHouseAddress: listing.auctionHouse,
    tokenMint: listing.tokenMint,
    tokenATA: listing.tokenATA,
    price: String(listing.price),
    sellerExpiry: String(listing.sellerExpiry),
  });
  if (listing.sellerReferral) qs.set('sellerReferral', listing.sellerReferral);

  const res = await meFetch(`/instructions/buy_now?${qs.toString()}`, true);
  if (res.status === 401) throw Object.assign(new Error('Magic Eden rejected the API key'), { code: 'bad_key' });
  if (!res.ok) throw Object.assign(new Error(`Magic Eden buy failed (HTTP ${res.status})`), { code: 'me_error' });

  const json = (await res.json()) as { tx?: { data?: number[] }; v0?: { tx?: { data?: number[] } } };
  const buf = json.v0?.tx?.data ?? json.tx?.data;
  if (!buf || !Array.isArray(buf)) throw Object.assign(new Error('Magic Eden returned no transaction'), { code: 'me_error' });

  return {
    txBase64: Buffer.from(buf).toString('base64'),
    versioned: !!json.v0,
    price: listing.price,
  };
}
