/**
 * Thin, cached server-side client for the public Pokémon TCG API
 * (api.pokemontcg.io). Used to (a) power the "Add Card" autocomplete with real
 * cards + official scans and (b) backfill real card images onto demo cards.
 * Results are cached in-process so the collection screen never hammers the API.
 */
import { getRedis } from '@battler/server-kit';

const API = 'https://api.pokemontcg.io/v2/cards';
const apiHeaders: Record<string, string> = process.env.POKEMONTCG_API_KEY
  ? { 'X-Api-Key': process.env.POKEMONTCG_API_KEY }
  : {};

const REDIS_IMG_PREFIX = 'tcgimg:';
const REDIS_IMG_TTL = 60 * 60 * 24 * 21; // 21 days — card art never changes

export interface TcgCard {
  id: string;
  name: string;
  number: string | null;
  rarity: string | null;
  set: string | null;
  year: string | null;
  image: string; // official scan (hi-res when available)
  thumb: string;
}

const TTL = 1000 * 60 * 60; // 1h
const searchCache = new Map<string, { at: number; cards: TcgCard[] }>();
const imageCache = new Map<string, string | null>();

// Official TCG card-image CDNs (the API migrated scans to images.scrydex.com).
const IMAGE_HOSTS = new Set(['images.scrydex.com', 'images.pokemontcg.io']);

/** Only allow storing card images that come from an official TCG image CDN. */
export function isAllowedCardImage(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    return IMAGE_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

const yearOf = (releaseDate?: string): string | null => releaseDate?.match(/^(\d{4})/)?.[1] ?? null;

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapCard(c: any): TcgCard | null {
  const image = c?.images?.large ?? c?.images?.small;
  if (!image) return null;
  return {
    id: String(c.id),
    name: String(c.name ?? ''),
    number: c.number ?? null,
    rarity: c.rarity ?? null,
    set: c.set?.name ?? null,
    year: yearOf(c.set?.releaseDate),
    image,
    thumb: c.images?.small ?? image,
  };
}

/** Search real TCG cards by (partial) name, newest sets first. */
export async function searchCards(rawName: string, limit = 24): Promise<TcgCard[]> {
  const name = rawName.trim().toLowerCase().replace(/[^a-z0-9 .'-]/g, '').slice(0, 40);
  if (name.length < 2) return [];
  const cached = searchCache.get(name);
  if (cached && Date.now() - cached.at < TTL) return cached.cards;

  const q = encodeURIComponent(`name:"${name}*"`);
  const url = `${API}?q=${q}&pageSize=${limit}&orderBy=-set.releaseDate&select=id,name,number,rarity,set,images`;
  try {
    const res = await fetch(url, { headers: apiHeaders });
    if (!res.ok) return cached?.cards ?? [];
    const json = (await res.json()) as { data?: any[] };
    const cards = (json.data ?? []).map(mapCard).filter((c): c is TcgCard => !!c);
    searchCache.set(name, { at: Date.now(), cards });
    return cards;
  } catch {
    return cached?.cards ?? [];
  }
}

export interface BrowseResult {
  cards: TcgCard[];
  page: number;
  hasMore: boolean;
  totalCount: number;
}

/** Filter pills on the Pokédex → a Lucene `q` fragment for api.pokemontcg.io. */
const FILTER_Q: Record<string, string> = {
  all: '',
  mega: 'subtypes:mega',
  ex: 'subtypes:ex',
  special: '(rarity:"Special Illustration Rare" OR rarity:"Illustration Rare")',
  vmax: 'subtypes:vmax',
};

const browseCache = new Map<string, { at: number; result: BrowseResult }>();
const BROWSE_TTL = 1000 * 60 * 30; // 30m

/**
 * Public, paginated TCG card browse for the Pokédex. Supports a free-text name
 * query and a filter pill, newest sets first. Cached in-process + Redis so the
 * upstream API is hit at most once per (query, filter, page).
 */
export async function browseCards(opts: {
  q?: string;
  filter?: string;
  page?: number;
  pageSize?: number;
}): Promise<BrowseResult> {
  const page = Math.max(1, Math.min(200, Math.floor(opts.page ?? 1)));
  const pageSize = Math.max(1, Math.min(36, Math.floor(opts.pageSize ?? 24)));
  const name = (opts.q ?? '').trim().toLowerCase().replace(/[^a-z0-9 .'-]/g, '').slice(0, 40);
  const filter = opts.filter && FILTER_Q[opts.filter] !== undefined ? opts.filter : 'all';

  // v2 = chronological order (bumped to bust v1 newest-first cache entries).
  const cacheKey = `v2|${name}|${filter}|${page}|${pageSize}`;
  const cached = browseCache.get(cacheKey);
  if (cached && Date.now() - cached.at < BROWSE_TTL) return cached.result;
  const redisKey = `tcgbrowse:${cacheKey}`;
  try {
    const hit = await getRedis().get(redisKey);
    if (hit) {
      const result = JSON.parse(hit) as BrowseResult;
      browseCache.set(cacheKey, { at: Date.now(), result });
      return result;
    }
  } catch {
    /* redis optional */
  }

  const parts: string[] = [];
  if (name.length >= 1) parts.push(`name:"${name}*"`);
  if (FILTER_Q[filter]) parts.push(FILTER_Q[filter]);
  // Restrict to real Pokémon cards (not Trainer/Energy) so the grid stays on-brand.
  parts.push('supertype:pokemon');
  const q = encodeURIComponent(parts.join(' '));
  // Chronological: oldest sets first (Base Set 1999 → newest), then card number.
  const url =
    `${API}?q=${q}&page=${page}&pageSize=${pageSize}` +
    `&orderBy=set.releaseDate,number&select=id,name,number,rarity,set,images`;

  try {
    const res = await fetch(url, { headers: apiHeaders });
    if (!res.ok) {
      const fallback: BrowseResult = { cards: cached?.result.cards ?? [], page, hasMore: false, totalCount: 0 };
      return fallback;
    }
    const json = (await res.json()) as { data?: any[]; totalCount?: number };
    const cards = (json.data ?? []).map(mapCard).filter((c): c is TcgCard => !!c);
    const totalCount = Number(json.totalCount ?? 0);
    const result: BrowseResult = { cards, page, hasMore: page * pageSize < totalCount, totalCount };
    browseCache.set(cacheKey, { at: Date.now(), result });
    try {
      await getRedis().set(redisKey, JSON.stringify(result), 'EX', 60 * 60 * 6);
    } catch {
      /* redis optional */
    }
    return result;
  } catch {
    return { cards: cached?.result.cards ?? [], page, hasMore: false, totalCount: 0 };
  }
}

/**
 * Resolve a single representative card scan for a species/card name. Returns the
 * lightweight (small) image so collection tiles load fast. Cached in-process and
 * in Redis (survives restarts) so the collection never re-hits the API.
 */
export async function resolveCardImage(query: string): Promise<string | null> {
  const key = query.trim().toLowerCase();
  if (key.length < 2) return null;
  if (imageCache.has(key)) return imageCache.get(key) ?? null;

  try {
    const cached = await getRedis().get(REDIS_IMG_PREFIX + key);
    if (cached != null) {
      const v = cached === '' ? null : cached;
      imageCache.set(key, v);
      return v;
    }
  } catch {
    /* redis optional */
  }

  const cards = await searchCards(key, 1);
  const img = cards[0]?.thumb ?? null; // small scan = fast tiles
  imageCache.set(key, img);
  try {
    await getRedis().set(REDIS_IMG_PREFIX + key, img ?? '', 'EX', REDIS_IMG_TTL);
  } catch {
    /* redis optional */
  }
  return img;
}
