'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from '@/components/Icon';
import {
  dismissAnnouncement,
  getVisibleAnnouncements,
  type Announcement,
} from '@/lib/announcements';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export function AnnouncementBanner() {
  const [items, setItems] = useState<Announcement[]>([]);
  const reduced = useReducedMotion();

  const refresh = useCallback(() => {
    // Show only the single highest-priority announcement — a stack of promo bars
    // above the hero kills the premium first impression. Dismissing reveals the next.
    setItems(getVisibleAnnouncements().slice(0, 1));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onDismiss = (id: string) => {
    dismissAnnouncement(id);
    refresh();
  };

  if (items.length === 0) return null;

  return (
    <div className="announcement-stack" role="status">
      <AnimatePresence initial={false}>
        {items.map((a) => (
          <motion.div
            key={a.id}
            className={`shine-banner ${a.variant}`}
            initial={reduced ? false : { opacity: 0, y: -12, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: reduced ? 0 : 0.32 }}
          >
            <div className="shine-banner-body">
              {a.isNew && <span className="new-pulse" aria-hidden />}
              <span>{a.message}</span>
            </div>
            <div className="shine-banner-actions">
              {a.href && (
                <Link href={a.href} className="btn sm accent">
                  {a.hrefLabel ?? 'Learn more'}
                </Link>
              )}
              <button
                type="button"
                className="banner-dismiss"
                aria-label="Dismiss announcement"
                onClick={() => onDismiss(a.id)}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
