'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid,
  Swords,
  ShoppingBag,
  Users,
  PlusCircle,
  Settings,
  Home,
} from 'lucide-react';
import { useNetwork, useSession } from '@/components/Providers';
import { prefetchRouteData } from '@/lib/clientCache';
import { Pokeball } from '@/components/Pokeball';

const ITEMS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/collection', label: 'Cards', icon: LayoutGrid },
  { href: '/market', label: 'Market', icon: ShoppingBag },
  { href: '/team', label: 'Team', icon: Users },
  { href: '/battle', label: 'Battle', icon: Swords, highlight: true },
  { href: '/add-card', label: 'Add', icon: PlusCircle, mockOnly: false },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const network = useNetwork();
  const { signedIn } = useSession();
  const mode = network?.mode ?? null;

  const links = ITEMS.filter((item) => !('mockOnly' in item && item.mockOnly));

  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {links.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch
            onMouseEnter={() => prefetchRouteData(item.href, signedIn)}
            onFocus={() => prefetchRouteData(item.href, signedIn)}
            className={`bottom-nav-link ${active ? 'active' : ''} ${'highlight' in item && item.highlight ? 'highlight' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {'highlight' in item && item.highlight ? (
              <Pokeball size={22} spin={active} />
            ) : (
              <Icon size={20} strokeWidth={2.2} aria-hidden />
            )}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
