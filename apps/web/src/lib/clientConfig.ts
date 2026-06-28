/** Client-safe config (NEXT_PUBLIC_* only — never import server-kit here).
 *  Wallet RPC uses public Solana endpoints; Helius keys stay server-side only. */
export const clientConfig = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? '',
  wsUrl: process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001',
  heliusRpcUrl: process.env.NEXT_PUBLIC_HELIUS_RPC_URL ?? 'https://api.mainnet-beta.solana.com',
  heliusDevnetRpcUrl: process.env.NEXT_PUBLIC_HELIUS_DEVNET_RPC_URL ?? 'https://api.devnet.solana.com',
  cluster: process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? 'mainnet-beta',
  spriteHost: process.env.NEXT_PUBLIC_SPRITE_HOST ?? 'https://play.pokemonshowdown.com/sprites',
  cryHost: process.env.NEXT_PUBLIC_CRY_HOST ?? 'https://play.pokemonshowdown.com/audio/cries',
  enablePokemonArt: (process.env.NEXT_PUBLIC_ENABLE_POKEMON_ART ?? 'true') !== 'false',
  treasuryWallet: process.env.NEXT_PUBLIC_TREASURY_WALLET ?? '',
};

/** Circle USDC SPL mint per cluster (for the wallet balance readout). */
export const USDC_MINT: Record<'mainnet-beta' | 'devnet', string> = {
  'mainnet-beta': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  devnet: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
};

/**
 * Wallet/RPC endpoint for a given Solana cluster.
 *
 * Routes through our same-origin `/api/rpc` proxy so the browser talks to Helius
 * via the server — the Helius API key is injected server-side and never reaches
 * the client bundle. Falls back to a public Solana endpoint only if no base URL is
 * resolvable (e.g. SSR with NEXT_PUBLIC_API_URL unset).
 */
export function endpointForCluster(cluster: 'mainnet-beta' | 'devnet'): string {
  const c = cluster === 'devnet' ? 'devnet' : 'mainnet';
  const base = clientConfig.apiUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  if (base) return `${base}/api/rpc?cluster=${c}`;
  return cluster === 'devnet' ? clientConfig.heliusDevnetRpcUrl : clientConfig.heliusRpcUrl;
}
