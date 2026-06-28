import type { ButtonHTMLAttributes, AnchorHTMLAttributes } from 'react';
import Link from 'next/link';

type Variant = 'accent' | 'secondary' | 'ghost' | 'danger' | 'dark' | 'gold';
type Size = 'sm' | 'md' | 'xl';

const variantClass: Record<Variant, string> = {
  accent: 'accent',
  secondary: 'secondary',
  ghost: 'ghost',
  danger: 'danger',
  dark: 'dark',
  gold: 'gold',
};

type BaseProps = {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  glow?: boolean;
  className?: string;
};

type BtnProps = BaseProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type LinkProps = BaseProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string };

function classes({ variant = 'accent', size = 'md', block, glow, className = '' }: BaseProps) {
  return [
    'btn',
    variantClass[variant],
    size === 'sm' ? 'sm' : size === 'xl' ? 'xl' : '',
    block ? 'block' : '',
    glow ? 'glow' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export function Button(props: BtnProps | LinkProps) {
  if ('href' in props && props.href) {
    const { href, variant, size, block, glow, className, children, ...rest } = props;
    return (
      <Link href={href} className={classes({ variant, size, block, glow, className })} {...rest}>
        {children}
      </Link>
    );
  }

  const { variant, size, block, glow, className, children, ...rest } = props as BtnProps;
  return (
    <button className={classes({ variant, size, block, glow, className })} {...rest}>
      {children}
    </button>
  );
}
