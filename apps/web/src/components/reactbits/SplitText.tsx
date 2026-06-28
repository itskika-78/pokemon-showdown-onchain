'use client';

import { motion } from 'framer-motion';

/**
 * React Bits–style SplitText: each word rises up from a clipped baseline with a
 * smooth stagger. Optional per-word class (so gradient/shine words keep their
 * fill). Respects reduced-motion via framer-motion's reduced-motion handling.
 */
export function SplitText({
  text,
  className = '',
  wordClassName = '',
  delay = 0,
  stagger = 0.07,
}: {
  text: string;
  className?: string;
  wordClassName?: string;
  delay?: number;
  stagger?: number;
}) {
  const words = text.split(' ');
  return (
    <span className={className} aria-label={text}>
      {words.map((w, i) => (
        <span
          key={i}
          aria-hidden
          style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom', lineHeight: 1.05 }}
        >
          <motion.span
            className={wordClassName}
            style={{ display: 'inline-block', willChange: 'transform' }}
            initial={{ y: '120%' }}
            animate={{ y: '0%' }}
            transition={{ duration: 0.8, delay: delay + i * stagger, ease: [0.16, 1, 0.3, 1] }}
          >
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </span>
  );
}
