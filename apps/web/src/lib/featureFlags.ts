export interface NavFeature {
  id: string;
  href: string;
  label: string;
  isNew: boolean;
}

export const NAV_FEATURES: NavFeature[] = [
  { id: 'pokedex', href: '/pokedex', label: 'Pokédex', isNew: true },
  { id: 'market', href: '/market', label: 'Market', isNew: true },
  { id: 'friends', href: '/friends', label: 'Friends', isNew: true },
  { id: 'add-card', href: '/add-card', label: 'Add Card', isNew: true },
  { id: 'battle-wager', href: '/battle', label: 'Battle', isNew: true },
];

const STORAGE_KEY = 'visited-features';

export function getVisitedFeatures(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markFeatureVisited(id: string): void {
  const set = getVisitedFeatures();
  if (set.has(id)) return;
  set.add(id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

export function isFeatureNew(id: string): boolean {
  const feature = NAV_FEATURES.find((f) => f.id === id);
  if (!feature?.isNew) return false;
  return !getVisitedFeatures().has(id);
}

export function getFeatureIdForPath(pathname: string): string | null {
  const match = NAV_FEATURES.find((f) => f.href === pathname);
  return match?.id ?? null;
}
