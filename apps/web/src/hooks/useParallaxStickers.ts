'use client';

import { useCallback, useEffect, useRef } from 'react';

/** Lightweight cursor parallax for decorative sticker layers. */
export function useParallaxStickers(enabled: boolean, strength = 0.018) {
  const layerRef = useRef<HTMLDivElement>(null);
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const raf = useRef<number>();

  const onMove = useCallback(
    (e: MouseEvent) => {
      if (!enabled) return;
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      target.current = {
        x: (e.clientX - cx) * strength,
        y: (e.clientY - cy) * strength,
      };
    },
    [enabled, strength],
  );

  useEffect(() => {
    if (!enabled) {
      if (layerRef.current) layerRef.current.style.transform = '';
      return;
    }

    const tick = () => {
      current.current.x += (target.current.x - current.current.x) * 0.08;
      current.current.y += (target.current.y - current.current.y) * 0.08;
      if (layerRef.current) {
        layerRef.current.style.transform = `translate(${current.current.x}px, ${current.current.y}px)`;
      }
      raf.current = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    raf.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [enabled, onMove]);

  return layerRef;
}
