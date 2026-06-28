import type { Metadata } from 'next';
import './globals.css';
import './premium.css';
import './pokedex/pokedex.css';
import './overworld.css';
import './theme-global.css';
import { Providers } from '@/components/Providers';
import { AppDataProvider } from '@/components/AppDataProvider';
import { NavBar } from '@/components/NavBar';
import { PokeLoader } from '@/components/PokeLoader';
import { AnnouncementBanner } from '@/components/AnnouncementBanner';
import { BackendBanner } from '@/components/BackendBanner';
import { AppBackground } from '@/components/AppBackground';
import { BottomNav } from '@/components/BottomNav';
import TargetCursor from '@/components/reactbits/TargetCursor';

export const metadata: Metadata = {
  title: 'Pokémon Showdown Onchain',
  description:
    'Pokémon Showdown onchain — wager SOL or stake cards in 6v6 battles. Your team is the cNFTs in your Solana wallet.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppBackground />
        <TargetCursor
          spinDuration={2.2}
          hideDefaultCursor
          parallaxOn
          hoverDuration={0.35}
          cursorColor="#0a0a0c"
          cursorColorOnTarget="#e3120b"
        />
        <Providers>
          <AppDataProvider>
          <div className="app-shell">
            <PokeLoader />
            <NavBar />
            <div className="container app-main">
              <BackendBanner />
              <AnnouncementBanner />
              <main id="main-content">{children}</main>
            </div>
            <BottomNav />
          </div>
          </AppDataProvider>
        </Providers>
      </body>
    </html>
  );
}
