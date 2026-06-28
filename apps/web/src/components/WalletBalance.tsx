'use client';

import { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { useNetwork } from '@/components/Providers';
import { USDC_MINT } from '@/lib/clientConfig';

interface Balances {
  sol: number;
  usdc: number | null;
}

/**
 * Live on-chain wallet balance (SOL + USDC) for the connected wallet, read
 * straight from the active cluster's RPC. Replaces the old off-chain "credits"
 * pill — this is the user's real money. Refreshes on a short poll + on the
 * `balance-refresh` window event (fired after a purchase).
 */
export function WalletBalance({ compact = false }: { compact?: boolean }) {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const net = useNetwork();
  const cluster = net?.cluster ?? 'mainnet-beta';
  const [bal, setBal] = useState<Balances | null>(null);

  useEffect(() => {
    if (!connected || !publicKey) {
      setBal(null);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const lamports = await connection.getBalance(publicKey, 'confirmed');
        let usdc: number | null = null;
        try {
          const mint = new PublicKey(USDC_MINT[cluster]);
          const accts = await connection.getParsedTokenAccountsByOwner(publicKey, { mint });
          usdc = accts.value.reduce(
            (sum, a) => sum + (a.account.data.parsed?.info?.tokenAmount?.uiAmount ?? 0),
            0,
          );
        } catch {
          usdc = null; // mint not found on this cluster / no token account
        }
        if (alive) setBal({ sol: lamports / LAMPORTS_PER_SOL, usdc });
      } catch {
        if (alive) setBal(null);
      }
    };
    load();
    const id = setInterval(load, 20_000);
    const onRefresh = () => load();
    window.addEventListener('balance-refresh', onRefresh);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener('balance-refresh', onRefresh);
    };
  }, [connected, publicKey, connection, cluster]);

  if (!connected || !bal) return null;

  return (
    <span className={`wallet-bal ${compact ? 'compact' : ''}`} title={`On-chain balance (${cluster})`}>
      <span className="wallet-bal-sol">◎ {bal.sol.toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
      {bal.usdc != null && bal.usdc > 0 && (
        <span className="wallet-bal-usdc">${bal.usdc.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
      )}
    </span>
  );
}
