/** Authentic CSS Poké Ball. Ring/band widths scale with `size` so it reads
 *  correctly from a 16px chip to a 360px hero orb. */
export function Pokeball({
  size = 64,
  spin = false,
  className = '',
  style,
}: {
  size?: number;
  spin?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const bw = Math.max(2, Math.round(size * 0.05)); // outline / band thickness
  return (
    <span
      className={`pokeball ${spin ? 'spin' : ''} ${className}`}
      style={{ width: size, height: size, ['--pbb' as string]: `${bw}px`, ...style }}
      aria-hidden
    >
      <span className="pokeball-band" />
      <span className="pokeball-btn" />
    </span>
  );
}
