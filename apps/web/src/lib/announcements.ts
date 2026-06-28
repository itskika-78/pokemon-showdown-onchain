export type AnnouncementVariant = 'new-feature' | 'event' | 'warning';

export interface Announcement {
  id: string;
  message: string;
  href?: string;
  hrefLabel?: string;
  variant: AnnouncementVariant;
  isNew?: boolean;
}

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'wager-v1',
    message: 'Wager matches are live — stake credits or put a card on the line.',
    href: '/battle',
    hrefLabel: 'Enter arena',
    variant: 'new-feature',
    isNew: true,
  },
  {
    id: 'market-beta',
    message: 'Browse the card market and build your collection with credits.',
    href: '/market',
    hrefLabel: 'Open market',
    variant: 'event',
    isNew: true,
  },
];

const STORAGE_KEY = 'dismissed-announcements';

export function getDismissedAnnouncements(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function dismissAnnouncement(id: string): void {
  const set = getDismissedAnnouncements();
  set.add(id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

export function getVisibleAnnouncements(): Announcement[] {
  const dismissed = getDismissedAnnouncements();
  return ANNOUNCEMENTS.filter((a) => !dismissed.has(a.id));
}
