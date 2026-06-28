'use client';

import { motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export function StaggerChildren({
  children,
  className,
  stagger = 0.06,
  immediate = false,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
  /**
   * Play on mount instead of on scroll-into-view. Use for primary page content
   * (grids/lists) so it can never get stuck hidden if the viewport observer
   * doesn't fire (below-the-fold at mount, headless render, etc.). Leave false
   * for decorative scroll-reveals.
   */
  immediate?: boolean;
}) {
  const reduced = useReducedMotion();

  const trigger = immediate
    ? { animate: 'show' as const }
    : { whileInView: 'show' as const, viewport: { once: true, margin: '-40px' } };

  return (
    <motion.div
      className={className}
      initial="hidden"
      {...trigger}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: reduced ? 0 : stagger } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={className}
      variants={{
        hidden: reduced ? { opacity: 1 } : { opacity: 0, y: 16, scale: 0.97 },
        show: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: { duration: reduced ? 0 : 0.38, ease: [0.22, 1, 0.36, 1] },
        },
      }}
    >
      {children}
    </motion.div>
  );
}
