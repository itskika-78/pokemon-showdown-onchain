'use client';

import { useRef } from 'react';
import { motion, useScroll, useVelocity, useTransform, useSpring } from 'framer-motion';
import { Pokeball } from '@/components/Pokeball';

export function VelocityMarquee({ items }: { items: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const scrollVelocity = useVelocity(scrollY);
  const smoothVelocity = useSpring(scrollVelocity, { damping: 50, stiffness: 400 });
  const x = useTransform(smoothVelocity, [-1200, 0, 1200], [-80, 0, 80]);

  const doubled = [...items, ...items];

  return (
    <div ref={ref} className="velocity-marquee glass-pill">
      <motion.div className="velocity-marquee-velocity" style={{ x }}>
        <div className="velocity-marquee-track">
          {doubled.map((name, i) => (
            <span className="velocity-marquee-item" key={`${name}-${i}`}>
              <Pokeball size={16} />
              {name}
            </span>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
