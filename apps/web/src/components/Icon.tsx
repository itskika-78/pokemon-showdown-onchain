/** Clean line-icon set (currentColor, 24×24). Replaces emoji across the app. */
const PATHS: Record<string, React.ReactNode> = {
  bolt: <path d="M13 2 L5 13 h6 l-1 9 9-12 h-6 l1-8z" />,
  sword: (
    <>
      <path d="M14.5 4 L20 4 L20 9.5 L9 20.5 L3.5 15z" />
      <path d="M6 14 L10 18 M3 21 l3-3" />
    </>
  ),
  cards: (
    <>
      <rect x="3" y="6" width="12" height="15" rx="2" />
      <path d="M8 3 h11 a2 2 0 0 1 2 2 v11" />
    </>
  ),
  team: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  link: (
    <>
      <path d="M9 12 h6" />
      <path d="M10 8 H7 a4 4 0 0 0 0 8 h3" />
      <path d="M14 8 h3 a4 4 0 0 1 0 8 h-3" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 4 h10 v4 a5 5 0 0 1-10 0z" />
      <path d="M7 5 H4 v2 a3 3 0 0 0 3 3 M17 5 h3 v2 a3 3 0 0 1-3 3" />
      <path d="M12 13 v4 M9 21 h6 M10 21 a2 2 0 0 1 4 0" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 l7 3 v5 c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9 V6z" />
      <path d="M9.5 12 l1.8 1.8 L15 9.8" />
    </>
  ),
  heal: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8 v8 M8 12 h8" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7 v5 l3 2" />
    </>
  ),
  swap: <path d="M7 7 h11 l-3-3 M17 17 H6 l3 3 M18 7 v3 M6 17 v-3" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21 l-4.3-4.3" />
    </>
  ),
  handshake: <path d="M3 12 l4-4 4 3 2-2 4 4-2 2-2-2-2 2-2-2-2 2-2-1z" />,
  spark: <path d="M12 3 v4 M12 17 v4 M3 12 h4 M17 12 h4 M6 6 l2 2 M16 16 l2 2 M18 6 l-2 2 M8 16 l-2 2" />,
  plus: <path d="M12 5 v14 M5 12 h14" />,
  trash: (
    <>
      <path d="M4 7 h16 M9 7 V4 h6 v3 M6 7 l1 13 h10 l1-13" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10 h18 M16 14 h2" />
    </>
  ),
  arrowRight: <path d="M5 12 h14 M13 6 l6 6-6 6" />,
  close: <path d="M6 6 l12 12 M18 6 L6 18" />,
  menu: (
    <>
      <path d="M4 7 h16 M4 12 h16 M4 17 h16" />
    </>
  ),
};

export function Icon({
  name,
  size = 18,
  className = '',
  style,
}: {
  name: keyof typeof PATHS | string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      className={`icn ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden
    >
      {PATHS[name] ?? null}
    </svg>
  );
}
