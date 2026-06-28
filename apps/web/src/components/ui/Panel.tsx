import type { HTMLAttributes } from 'react';

type Variant = 'default' | 'game' | 'dark';

export function Panel({
  children,
  variant = 'default',
  pad = 'md',
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: Variant;
  pad?: 'md' | 'lg';
}) {
  const cls = [
    variant === 'game' ? 'game-panel' : 'panel',
    variant === 'dark' ? 'dark' : '',
    pad === 'lg' ? 'pad-lg' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} {...props}>
      {children}
    </div>
  );
}
