import type { ReactNode } from 'react';
import { Pokeball } from '@/components/Pokeball';
import { FadeIn } from '@/components/motion';

export function EmptyState({
  title,
  description,
  actions,
  icon = 'pokeball',
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: 'pokeball' | 'none';
}) {
  return (
    <FadeIn>
      <div className="empty-state">
        {icon === 'pokeball' && <Pokeball size={48} className="wobble" />}
        <h3>{title}</h3>
        {description && <p className="muted">{description}</p>}
        {actions && <div className="empty-state-actions">{actions}</div>}
      </div>
    </FadeIn>
  );
}
