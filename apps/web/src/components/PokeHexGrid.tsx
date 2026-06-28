'use client';

import { useEffect, useRef } from 'react';
import { clientConfig } from '@/lib/clientConfig';

/**
 * React Bits <ShapeGrid/> (hexagon variant) extended so every hexagon holds a
 * procedurally-randomized Pokémon — drawn from the ENTIRE national dex (1..1025),
 * lazily loaded per visible cell and clipped to the hex. The field scrolls
 * diagonally and SMOOTHLY (the grid offset is never wrapped, so the world→species
 * mapping is continuous — no popping). Hovering lights a hex with a fading trail.
 * Canvas 2D, sprites only displayed (cross-origin draw taint is harmless).
 */

const DEX_TOTAL = 1025; // every Pokémon, Bulbasaur .. Pecharunt
const spriteUrl = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) ^ 0x9e3779b9;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

export function PokeHexGrid({
  squareSize = 46,
  speed = 0.4,
  borderColor = 'rgba(255,255,255,0.16)',
  hoverFillColor = 'rgba(230,0,0,0.28)',
  hoverTrailAmount = 6,
}: {
  squareSize?: number;
  speed?: number;
  borderColor?: string;
  hoverFillColor?: string;
  hoverTrailAmount?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const enableArt = clientConfig.enablePokemonArt;

    // ---- lazy per-dex-id sprite cache (only visible species ever load) ----
    const loaded = new Map<number, HTMLImageElement>();
    const inflight = new Set<number>();
    const failed = new Set<number>();
    const getSprite = (id: number): HTMLImageElement | null => {
      const hit = loaded.get(id);
      if (hit) return hit;
      if (enableArt && !inflight.has(id) && !failed.has(id)) {
        inflight.add(id);
        const img = new Image();
        img.onload = () => { loaded.set(id, img); inflight.delete(id); };
        img.onerror = () => { inflight.delete(id); failed.add(id); };
        img.src = spriteUrl(id);
      }
      return null;
    };

    const hexHoriz = squareSize * 1.5;
    const hexVert = squareSize * Math.sqrt(3);
    const gridOffset = { x: 0, y: 0 };
    let hovered: { x: number; y: number } | null = null;
    const trail: { x: number; y: number }[] = [];
    const opacities = new Map<string, number>();
    let raf = 0;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      ctx.imageSmoothingEnabled = false; // crisp pixel sprites
    };
    window.addEventListener('resize', resize);
    resize();

    const drawHexPath = (cx: number, cy: number, size: number) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const vx = cx + size * Math.cos(angle);
        const vy = cy + size * Math.sin(angle);
        if (i === 0) ctx.moveTo(vx, vy);
        else ctx.lineTo(vx, vy);
      }
      ctx.closePath();
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const colShift = Math.floor(gridOffset.x / hexHoriz);
      const rowShift = Math.floor(gridOffset.y / hexVert);
      const offsetX = ((gridOffset.x % hexHoriz) + hexHoriz) % hexHoriz;
      const offsetY = ((gridOffset.y % hexVert) + hexVert) % hexVert;
      const cols = Math.ceil(canvas.width / hexHoriz) + 3;
      const rows = Math.ceil(canvas.height / hexVert) + 3;

      for (let col = -2; col < cols; col++) {
        for (let row = -2; row < rows; row++) {
          const cx = col * hexHoriz + offsetX;
          const cy = row * hexVert + ((col + colShift) % 2 !== 0 ? hexVert / 2 : 0) + offsetY;

          // world-stable species pick (continuous across scroll → no pop)
          const worldCol = col + colShift;
          const worldRow = row + rowShift;
          const id = (hash2(worldCol, worldRow) % DEX_TOTAL) + 1;
          const sprite = enableArt ? getSprite(id) : null;

          if (sprite) {
            ctx.save();
            drawHexPath(cx, cy, squareSize * 0.98);
            ctx.clip();
            ctx.globalAlpha = 0.62;
            const s = squareSize * 1.95;
            ctx.drawImage(sprite, cx - s / 2, cy - s / 2, s, s);
            ctx.globalAlpha = 1;
            ctx.restore();
          }

          const alpha = opacities.get(`${col},${row}`);
          if (alpha) {
            ctx.globalAlpha = alpha;
            drawHexPath(cx, cy, squareSize);
            ctx.fillStyle = hoverFillColor;
            ctx.fill();
            ctx.globalAlpha = 1;
          }

          drawHexPath(cx, cy, squareSize);
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // vignette so edges fade into the jet-black band
      const g = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, Math.hypot(canvas.width, canvas.height) / 2,
      );
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.7)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    const updateOpacities = () => {
      const targets = new Map<string, number>();
      if (hovered) targets.set(`${hovered.x},${hovered.y}`, 1);
      for (let i = 0; i < trail.length; i++) {
        const t = trail[i]!;
        const key = `${t.x},${t.y}`;
        if (!targets.has(key)) targets.set(key, (trail.length - i) / (trail.length + 1));
      }
      for (const [key] of targets) if (!opacities.has(key)) opacities.set(key, 0);
      for (const [key, op] of opacities) {
        const target = targets.get(key) || 0;
        const next = op + (target - op) * 0.15;
        if (next < 0.005) opacities.delete(key);
        else opacities.set(key, next);
      }
    };

    const tick = () => {
      // NOTE: never wrap the offset — continuous offset keeps colShift/rowShift
      // monotonic so each world hex keeps its species as it scrolls (smooth).
      const sp = Math.max(speed, 0.05);
      gridOffset.x -= sp;
      gridOffset.y -= sp;
      updateOpacities();
      draw();
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const colShift = Math.floor(gridOffset.x / hexHoriz);
      const offsetX = ((gridOffset.x % hexHoriz) + hexHoriz) % hexHoriz;
      const offsetY = ((gridOffset.y % hexVert) + hexVert) % hexVert;
      const col = Math.round((mx - offsetX) / hexHoriz);
      const rowOffset = (col + colShift) % 2 !== 0 ? hexVert / 2 : 0;
      const row = Math.round((my - offsetY - rowOffset) / hexVert);
      if (!hovered || hovered.x !== col || hovered.y !== row) {
        if (hovered && hoverTrailAmount > 0) {
          trail.unshift({ ...hovered });
          if (trail.length > hoverTrailAmount) trail.length = hoverTrailAmount;
        }
        hovered = { x: col, y: row };
      }
    };
    const onLeave = () => {
      if (hovered && hoverTrailAmount > 0) {
        trail.unshift({ ...hovered });
        if (trail.length > hoverTrailAmount) trail.length = hoverTrailAmount;
      }
      hovered = null;
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, [squareSize, speed, borderColor, hoverFillColor, hoverTrailAmount]);

  return <canvas ref={canvasRef} className="pokehex-canvas" aria-hidden />;
}
