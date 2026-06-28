import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  LedgerSettlementService,
  PgLedgerStore,
  OnChainSettlementService,
  keypairFromSecret,
  type EscrowStore,
  type OnChainCardEscrow,
} from '@battler/settlement';
import type { SettlementProvider, SettlementResult, SettlementOutcome } from '@battler/core';
import { loadServerConfig, clusterForNetwork, logger } from '@battler/server-kit';
import { getEffectiveDasSettings } from '@battler/ingest';
import { PgEscrowStore, PgCardEscrowStore } from './escrowStore.js';

/**
 * Load the escrow hot-wallet keypair: `ESCROW_SECRET_KEY` env (base58 or JSON
 * array) for prod, else the dev keypair persisted under `.runtime/` for devnet.
 * Returns null when no escrow is configured → on-chain wagers stay disabled.
 */
export function loadEscrowKeypair(): Keypair | null {
  const env = process.env.ESCROW_SECRET_KEY;
  if (env) {
    try { return keypairFromSecret(env); } catch (e) { logger.error({ err: e }, 'bad ESCROW_SECRET_KEY'); return null; }
  }
  for (const p of [resolve(process.cwd(), '.runtime/escrow-devnet.json'), resolve(process.cwd(), '../../.runtime/escrow-devnet.json')]) {
    if (existsSync(p)) {
      try { return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, 'utf8')))); } catch { /* ignore */ }
    }
  }
  return null;
}

const escrowKeypair = loadEscrowKeypair();
export const escrowPubkey: string | null = escrowKeypair ? escrowKeypair.publicKey.toBase58() : null;

/**
 * Settlement that follows the active network:
 *  - mock    → off-chain credit ledger ("pokecoins")
 *  - devnet/mainnet → real on-chain SOL escrow payout (custodial)
 * The on-chain path no-ops safely if no deposits were escrowed for the match,
 * so it can never pay out funds that weren't staked.
 */
export class NetworkAwareSettlement implements SettlementProvider {
  private readonly ledger = new LedgerSettlementService(new PgLedgerStore(), loadServerConfig().platformFeeBps);

  async settle(result: SettlementResult): Promise<SettlementOutcome> {
    const cfg = loadServerConfig();
    const eff = await getEffectiveDasSettings();
    const onChain = !!eff.activeRpcUrl;
    const rpcUrl = clusterForNetwork(eff.mode) === 'mainnet-beta' ? eff.heliusRpcUrl : eff.heliusDevnetRpcUrl;

    if (onChain && escrowKeypair && rpcUrl && cfg.treasuryWallet) {
      const cluster = clusterForNetwork(eff.mode);
      const connection = new Connection(rpcUrl, 'confirmed');
      const store: EscrowStore = new PgEscrowStore(cluster);
      // On-chain card (cNFT) escrow: a staked Phygitals card held by escrow is
      // transferred to the winner via Bubblegum at settlement.
      const card: OnChainCardEscrow = {
        cnft: { connection, escrow: escrowKeypair, rpcUrl },
        store: new PgCardEscrowStore(cluster),
      };
      const svc = new OnChainSettlementService(
        { connection, escrow: escrowKeypair, treasury: new PublicKey(cfg.treasuryWallet), feeBps: cfg.platformFeeBps },
        store,
        card,
      );
      try {
        return await svc.settle(result);
      } catch (e) {
        logger.error({ err: e, matchId: result.matchId }, 'on-chain settle failed');
        // Fall through to the ledger so the match still records a result.
      }
    }
    return this.ledger.settle(result);
  }
}
