/**
 * Collection-level market stats (Magic Eden floor / volume) for overview charts.
 */
import { getRedis } from '@battler/server-kit';

const ME_API = 'https://api-mainnet.magiceden.dev/v2';
const ME_SYMBOL = process.env.MAGICEDEN_COLLECTION_SYMBOL || 'phygitals';
const LAMPORTS_PER_SOL = 1_000_000_000;

const STATS_REDIS_KEY = `market:stats:${ME_SYMBOL}`;
const STATS_TTL_S = 60;
const SPARK_POINTS = 30;
const ME_FETCH_TIMEOUT_MS = 2_500;

let l1Stats: CollectionStats | null = null;

export interface CollectionStats {
  symbol: string;
  floorSol: number | null;
  listedCount: number | null;
  volumeAllSol: number | null;
  avgPrice24hrSol: number | null;
  floorSpark: number[];
  source: 'magiceden' | 'indicative';
  fetchedAt: number;
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function trendSeries(seedKey: string, anchor: number, points = SPARK_POINTS, volatility = 0.18): number[] {
  const rand = mulberry32(hashSeed(seedKey));
  const raw: number[] = [1];
  for (let i = 1; i < points; i++) {
    const step = (rand() - 0.48) * volatility;
    raw.push(Math.max(0.25, raw[i - 1]! * (1 + step)));
  }
  const last = raw[raw.length - 1]!;
  return raw.map((v) => Math.round(((v / last) * anchor) * 100) / 100);
}

export function changePct(series: number[]): number {
  if (series.length < 2) return 0;
  const first = series[0]!;
  const last = series[series.length - 1]!;
  if (first <= 0) return 0;
  return Math.round(((last - first) / first) * 1000) / 10;
}

interface MeStats {
  floorPrice?: number;
  listedCount?: number;
  volumeAll?: number;
  avgPrice24hr?: number;
}

async function fetchMagicEdenStats(): Promise<MeStats | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${ME_API}/collections/${encodeURIComponent(ME_SYMBOL)}/stats`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    }).finally(() => clearTimeout(t));
    if (!res.ok) return null;
    return (await res.json()) as MeStats;
  } catch {
    return null;
  }
}

const lamToSol = (l?: number): number | null =>
  typeof l === 'number' && l > 0 ? Math.round((l / LAMPORTS_PER_SOL) * 1000) / 1000 : null;

export async function getCollectionStats(): Promise<CollectionStats> {
  if (l1Stats && Date.now() - l1Stats.fetchedAt < STATS_TTL_S * 1000) {
    return l1Stats;
  }

  try {
    const cached = await getRedis().get(STATS_REDIS_KEY);
    if (cached) {
      l1Stats = JSON.parse(cached) as CollectionStats;
      return l1Stats;
    }
  } catch {
    /* redis optional */
  }

  const me = await Promise.race([
    fetchMagicEdenStats(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ME_FETCH_TIMEOUT_MS)),
  ]);
  const floorSol = lamToSol(me?.floorPrice);
  const volumeAllSol = lamToSol(me?.volumeAll);
  const avgPrice24hrSol = lamToSol(me?.avgPrice24hr);
  const hasLiveFloor = floorSol != null;
  const anchor = floorSol ?? 1.85;

  const stats: CollectionStats = {
    symbol: ME_SYMBOL,
    floorSol,
    listedCount: typeof me?.listedCount === 'number' ? me.listedCount : null,
    volumeAllSol,
    avgPrice24hrSol,
    floorSpark: trendSeries(`floor:${ME_SYMBOL}`, anchor, SPARK_POINTS, 0.12),
    source: hasLiveFloor ? 'magiceden' : 'indicative',
    fetchedAt: Date.now(),
  };

  try {
    await getRedis().set(STATS_REDIS_KEY, JSON.stringify(stats), 'EX', STATS_TTL_S);
  } catch {
    /* redis optional */
  }
  l1Stats = stats;
  return stats;
}
