'use client';

/**
 * A reliable, always-rendering hero card reel — an infinite horizontal marquee of
 * REAL card scans (plain <img>, so it never has the WebGL black-texture problem
 * the CircularGallery hit). Perspective stage + per-card depth tilt give it the
 * premium "reel" feel; hovering lifts a card. Pauses on hover.
 */
export function CardReel({ items }: { items: { image: string; text: string }[] }) {
  const loop = [...items, ...items];
  return (
    <div className="reel" aria-hidden>
      <div className="reel-track">
        {loop.map((it, i) => (
          <figure className="reel-card" key={i}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.image} alt={it.text} loading="eager" draggable={false} />
            <span className="reel-card-glow" />
            <figcaption>{it.text}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
