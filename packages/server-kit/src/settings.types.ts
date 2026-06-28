/**
 * Runtime-switchable DAS settings. Only `mode` is stored in Redis; Helius RPC
 * URLs and API keys are resolved exclusively from server environment variables.
 */
export type DasNetwork = 'devnet' | 'mainnet';

/** @deprecated use {@link DasNetwork} */
export type DasMode = DasNetwork;

export interface DasSettings {
  mode: DasNetwork;
}

export function isDasNetwork(v: unknown): v is DasNetwork {
  return v === 'devnet' || v === 'mainnet';
}

export function clusterForNetwork(net: DasNetwork): 'mainnet-beta' | 'devnet' {
  return net === 'mainnet' ? 'mainnet-beta' : 'devnet';
}
