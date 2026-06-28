'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSession, useNetwork } from '@/components/Providers';
import { prefetchRouteData } from '@/lib/clientCache';
import { Pokeball } from '@/components/Pokeball';
import { WalletBalance } from '@/components/WalletBalance';
import { NewBadge } from '@/components/NewBadge';
import { NAV_FEATURES, markFeatureVisited } from '@/lib/featureFlags';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const LINKS = [
  { href: '/pokedex', label: 'Pokédex', featureId: 'pokedex', mockOnly: false },
  { href: '/collection', label: 'Collection', featureId: null, mockOnly: false },
  { href: '/market', label: 'Market', featureId: 'market', mockOnly: false },
  { href: '/team', label: 'Team', featureId: null, mockOnly: false },
  { href: '/battle', label: 'Battle', featureId: 'battle-wager', mockOnly: false },
  { href: '/friends', label: 'Friends', featureId: 'friends', mockOnly: false },
  { href: '/add-card', label: 'Add Card', featureId: 'add-card', mockOnly: false },
  { href: '/settings', label: 'Settings', featureId: null, mockOnly: false },
];

function NavLink({
  href,
  label,
  featureId,
  active,
  onNavigate,
  signedIn,
}: {
  href: string;
  label: string;
  featureId: string | null;
  active: boolean;
  onNavigate?: () => void;
  signedIn: boolean;
}) {
  return (
    <span className="navlink-wrap">
      <Link
        href={href}
        className={`navlink ${active ? 'active' : ''}`}
        onClick={onNavigate}
        prefetch
        onMouseEnter={() => prefetchRouteData(href, signedIn)}
        onFocus={() => prefetchRouteData(href, signedIn)}
      >
        {label}
      </Link>
      {featureId && <NewBadge featureId={featureId} />}
    </span>
  );
}

export function NavBar() {
  const { signedIn, signOut } = useSession();
  const network = useNetwork();
  const mode = network?.mode ?? null;
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const links = LINKS;

  useEffect(() => {
    const feature = NAV_FEATURES.find((f) => f.href === pathname);
    if (feature) markFeatureVisited(feature.id);
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [drawerOpen]);

  const closeDrawer = () => setDrawerOpen(false);

  const onHome = pathname === '/';

  return (
    <>
      <svg className="nav-glass-defs" aria-hidden width="0" height="0">
        <defs>
          <filter id="nav-liquid-glass" x="-15%" y="-40%" width="130%" height="180%" colorInterpolationFilters="sRGB">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.007 0.011"
              numOctaves="2"
              seed="4"
              result="noise"
            >
              <animate
                attributeName="baseFrequency"
                dur="16s"
                values="0.007 0.011;0.010 0.008;0.006 0.013;0.007 0.011"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>
      <nav className={`nav${onHome ? ' nav-home' : ''}`}>
        <Link href="/" className="brand">
          <Pokeball size={26} spin />
          <span>
            Pokémon Showdown <span className="brand-chain">Onchain</span>
          </span>
        </Link>

        <div className="nav-links-desktop">
          {links.map((l) => (
            <NavLink
              key={l.href}
              href={l.href}
              label={l.label}
              featureId={l.featureId}
              active={pathname === l.href}
              signedIn={signedIn}
            />
          ))}
        </div>

        <span className="spacer" />
        <WalletBalance />
        {mode && (
          <span className={`pill ${mode}`} title="Active data source (Settings)">
            <span className="dot" />
            {mode}
          </span>
        )}
        {signedIn ? (
          <button className="btn secondary" onClick={signOut}>
            Sign out
          </button>
        ) : (
          <Link href="/login" className="btn accent nav-login">
            Login
          </Link>
        )}

        <button
          type="button"
          className={`nav-toggle ${drawerOpen ? 'open' : ''}`}
          aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((o) => !o)}
        >
          <span /><span /><span />
        </button>
      </nav>

      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              className="nav-drawer-backdrop"
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeDrawer}
              aria-hidden
            />
            <motion.aside
              className="nav-drawer"
              role="dialog"
              aria-label="Navigation menu"
              initial={reduced ? false : { x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            >
              <div className="nav-drawer-head">
                <Link href="/" className="brand" onClick={closeDrawer}>
                  <Pokeball size={22} />
                  <span>Menu</span>
                </Link>
                <button type="button" className="banner-dismiss" aria-label="Close" onClick={closeDrawer}>×</button>
              </div>
              {links.map((l) => (
                <NavLink
                  key={l.href}
                  href={l.href}
                  label={l.label}
                  featureId={l.featureId}
                  active={pathname === l.href}
                  onNavigate={closeDrawer}
                  signedIn={signedIn}
                />
              ))}
              <div className="nav-drawer-meta">
                <WalletBalance />
                {mode && (
                  <span className={`pill ${mode}`}>
                    <span className="dot" />
                    {mode}
                  </span>
                )}
                {signedIn ? (
                  <button className="btn secondary block" onClick={signOut}>
                    Sign out
                  </button>
                ) : (
                  <Link href="/login" className="btn accent block" onClick={closeDrawer}>
                    Login
                  </Link>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
