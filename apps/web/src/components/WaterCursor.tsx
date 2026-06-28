'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Watery refraction cursor: a soft lens that trails the pointer and DISTORTS the
 * page beneath it (SVG fractal-noise turbulence → feDisplacementMap on the
 * backdrop) — like looking through moving water. No colored dye, no sparkle.
 * The displacement scale eases up with pointer speed so fast moves ripple harder.
 */
export function WaterCursor() {
  const ref = useRef<HTMLDivElement>(null);
  const dispRef = useRef<SVGFEDisplacementMapElement>(null);
  const [on, setOn] = useState(false);

  const pos = useRef({ x: -400, y: -400 });
  const target = useRef({ x: -400, y: -400 });
  const last = useRef({ x: -400, y: -400 });
  const scale = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    setOn(true);

    let raf = 0;
    const onMove = (e: MouseEvent) => {
      target.current.x = e.clientX;
      target.current.y = e.clientY;
    };
    window.addEventListener('mousemove', onMove);

    const tick = () => {
      pos.current.x += (target.current.x - pos.current.x) * 0.16;
      pos.current.y += (target.current.y - pos.current.y) * 0.16;
      // speed → extra ripple strength (eased)
      const dx = pos.current.x - last.current.x;
      const dy = pos.current.y - last.current.y;
      const speed = Math.min(1, Math.hypot(dx, dy) / 26);
      const targetScale = 38 + speed * 78;
      scale.current += (targetScale - scale.current) * 0.1;
      last.current.x = pos.current.x;
      last.current.y = pos.current.y;

      if (ref.current) {
        ref.current.style.transform =
          `translate3d(${pos.current.x}px, ${pos.current.y}px, 0) translate(-50%, -50%)`;
      }
      if (dispRef.current) dispRef.current.setAttribute('scale', scale.current.toFixed(1));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  return (
    <>
      <svg className="water-cursor-defs" aria-hidden width="0" height="0">
        <defs>
          <filter id="water-distort" x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.016" numOctaves="2" seed="7" result="noise">
              <animate
                attributeName="baseFrequency"
                dur="18s"
                values="0.012 0.016;0.018 0.011;0.010 0.019;0.012 0.016"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap ref={dispRef} in="SourceGraphic" in2="noise" scale="26" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>
      {on && <div ref={ref} className="water-cursor" aria-hidden />}
    </>
  );
}
