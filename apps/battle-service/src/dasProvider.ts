import type { DasProvider } from '@battler/das';
import { getConfiguredProvider } from '@battler/ingest';

/**
 * Shared DAS provider, resolved from runtime settings (Settings tab) so the
 * service picks up mock ↔ mainnet switches without a restart. Async because the
 * mode is read from Redis.
 */
export function getDasProvider(): Promise<DasProvider> {
  return getConfiguredProvider();
}
