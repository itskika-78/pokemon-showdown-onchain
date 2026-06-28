import type { ReactNode } from 'react';
import { PokeStickers } from '@/components/PokeStickers';
import { PageTransition } from '@/components/motion';

export function PageShell({
  children,
  stickers = 4,
  interactiveStickers = false,
  fullWidth = false,
}: {
  children: ReactNode;
  stickers?: number;
  interactiveStickers?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <div className={`fx-content page-shell ${fullWidth ? 'page-shell-full' : ''}`}>
      <PokeStickers count={stickers} interactive={interactiveStickers} />
      <PageTransition>{children}</PageTransition>
    </div>
  );
}
