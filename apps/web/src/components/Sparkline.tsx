'use client';

import { useId } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  /** Up trend = accent green; down = red. Auto from first→last when omitted. */
  positive?: boolean;
  strokeWidth?: number;
  fill?: boolean;
  className?: string;
}

/**
 * Dependency-free inline SVG sparkline. Renders a smooth price line with an
 * optional gradient area fill. Pure SVG paths keep it GPU-cheap and crisp at any
 * DPR (4K-friendly), no canvas, no re-layout.
 */
export function Sparkline({
  data,
  width = 132,
  height = 40,
  positive,
  strokeWidth = 2,
  fill = true,
  className = '',
}: SparklineProps) {
  const gid = useId().replace(/:/g, '');
  if (!data || data.length < 2) return <svg width={width} height={height} className={className} aria-hidden />;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = strokeWidth + 1;
  const w = width;
  const h = height;
  const stepX = (w - pad * 2) / (data.length - 1);
  const y = (v: number) => h - pad - ((v - min) / range) * (h - pad * 2);
  const x = (i: number) => pad + i * stepX;

  const pts = data.map((v, i) => [x(i), y(v)] as const);
  const line = pts.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(2)},${py.toFixed(2)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1]![0].toFixed(2)},${h} L${pts[0]![0].toFixed(2)},${h} Z`;

  const up = positive ?? data[data.length - 1]! >= data[0]!;
  const stroke = up ? 'var(--spark-up, #16a34a)' : 'var(--spark-down, #dc2626)';

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={`sparkline ${className}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={`sg-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.30" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#sg-${gid})`} stroke="none" />}
      <path
        className="spark-line"
        d={line}
        pathLength={1}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={pts[pts.length - 1]![0]} cy={pts[pts.length - 1]![1]} r={strokeWidth + 0.6} fill={stroke} />
    </svg>
  );
}
