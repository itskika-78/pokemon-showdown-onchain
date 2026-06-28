import type { DasProvider } from '@battler/das';
import { getConfiguredProvider } from '@battler/ingest';

/**
 * Resolve the DAS provider from runtime settings (Settings tab): mock fixtures +
 * user-added cards in dev, or real Helius on mainnet. Async because the mode is
 * read from Redis and can change without a restart.
 */
export function getDasProvider(): Promise<DasProvider> {
  return getConfiguredProvider();
}
