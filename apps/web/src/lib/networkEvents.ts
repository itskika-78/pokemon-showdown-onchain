import type { DasNetwork } from '@/lib/api';

export interface NetworkChangeDetail {
  mode: DasNetwork;
  cluster: 'mainnet-beta' | 'devnet';
}

export const DAS_SETTINGS_CHANGED = 'das-settings-changed';

export function clusterForDasMode(mode: DasNetwork): 'mainnet-beta' | 'devnet' {
  return mode === 'devnet' ? 'devnet' : 'mainnet-beta';
}

/** Notify the app of a network switch — include mode for instant nav/wallet updates. */
export function dispatchNetworkChange(mode: DasNetwork): void {
  if (typeof window === 'undefined') return;
  const detail: NetworkChangeDetail = { mode, cluster: clusterForDasMode(mode) };
  window.dispatchEvent(new CustomEvent(DAS_SETTINGS_CHANGED, { detail }));
}

export function readNetworkChangeDetail(ev: Event): NetworkChangeDetail | null {
  const d = (ev as CustomEvent<NetworkChangeDetail>).detail;
  if (!d?.mode) return null;
  return {
    mode: d.mode,
    cluster: d.cluster ?? clusterForDasMode(d.mode),
  };
}
