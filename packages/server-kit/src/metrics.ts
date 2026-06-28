import { Registry, Gauge, Counter, collectDefaultMetrics } from 'prom-client';

/** Prometheus registry exposed at /metrics on both services. */
export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const activeBattles = new Gauge({
  name: 'active_battles',
  help: 'Number of battles currently in progress',
  registers: [registry],
});

export const matchesCompleted = new Counter({
  name: 'matches_completed_total',
  help: 'Total battles that reached a result',
  registers: [registry],
});

export const wagerVolumeTotal = new Counter({
  name: 'wager_volume_total',
  help: 'Total wagered credits settled',
  registers: [registry],
});

export const authFailures = new Counter({
  name: 'auth_failures_total',
  help: 'Failed SIWS/JWT auth attempts',
  registers: [registry],
});

export async function metricsText(): Promise<string> {
  return registry.metrics();
}

export const metricsContentType = registry.contentType;
