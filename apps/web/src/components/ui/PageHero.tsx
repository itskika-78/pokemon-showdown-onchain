import type { ReactNode } from 'react';
import { FadeIn } from '@/components/motion';

export function PageHero({
  kicker,
  title,
  subtitle,
  stats,
  actions,
  banner,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  stats?: { label: string; value: string }[];
  actions?: ReactNode;
  banner?: ReactNode;
}) {
  return (
    <FadeIn>
      <header className="page-hero">
        {kicker && <span className="page-hero-kicker">{kicker}</span>}
        <div className="page-hero-head">
          <div>
            <h1 className="page-hero-title">{title}</h1>
            {subtitle && <p className="page-hero-sub muted">{subtitle}</p>}
          </div>
          {actions && <div className="page-hero-actions">{actions}</div>}
        </div>
        {stats && stats.length > 0 && (
          <div className="page-hero-stats">
            {stats.map((s) => (
              <div key={s.label} className="page-hero-stat">
                <b>{s.value}</b>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        )}
        {banner}
      </header>
    </FadeIn>
  );
}
