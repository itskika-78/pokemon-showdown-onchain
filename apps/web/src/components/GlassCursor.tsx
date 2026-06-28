'use client';

import { useEffect, useRef, useState } from 'react';
import GlassSurface from '@/components/reactbits/GlassSurface';

/**
 * A liquid-glass lens that trails the pointer (React Bits <GlassSurface/>). Only
 * mounts on fine pointers with motion allowed, sits above everything with
 * pointer-events:none, and lerps toward the cursor for a smooth premium feel.
 */
export function GlassCursor() {
  const ref = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const pos = useRef({ x: -200, y: -200 });
  const target = useRef({ x: -200, y: -200 });

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduced) return;
    setEnabled(true);

    let raf = 0;
    const onMove = (e: MouseEvent) => {
      target.current.x = e.clientX;
      target.current.y = e.clientY;
    };
    const onDown = () => ref.current?.classList.add('is-down');
    const onUp = () => ref.current?.classList.remove('is-down');
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);

    const tick = () => {
      pos.current.x += (target.current.x - pos.current.x) * 0.2;
      pos.current.y += (target.current.y - pos.current.y) * 0.2;
      if (ref.current) {
        ref.current.style.transform = `translate3d(${pos.current.x}px, ${pos.current.y}px, 0) translate(-50%, -50%)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  if (!enabled) return null;

  return (
    <div ref={ref} className="glass-cursor" aria-hidden>
      <GlassSurface
        width={54}
        height={54}
        borderRadius={27}
        displace={1.4}
        distortionScale={-140}
        redOffset={4}
        greenOffset={13}
        blueOffset={23}
        brightness={62}
        opacity={0.9}
        blur={9}
        backgroundOpacity={0}
        saturation={1.3}
      >
        <span aria-hidden />
      </GlassSurface>
    </div>
  );
}
