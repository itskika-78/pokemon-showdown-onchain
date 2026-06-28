import type { HTMLAttributes } from 'react';

type Variant = 'default' | 'accent' | 'good' | 'muted';

export function Badge({
  children,
  variant = 'default',
  className = '',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  const cls = ['badge', variant !== 'default' ? variant : '', className].filter(Boolean).join(' ');
  return (
    <span className={cls} {...props}>
      {children}
    </span>
  );
}

export function Pill({
  children,
  mode,
  className = '',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { mode?: 'devnet' | 'mainnet' }) {
  return (
    <span className={`pill ${mode ?? ''} ${className}`.trim()} {...props}>
      {mode && <span className="dot" />}
      {children}
    </span>
  );
}
