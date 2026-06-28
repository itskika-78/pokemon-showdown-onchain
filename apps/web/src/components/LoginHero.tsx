'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Pokeball } from '@/components/Pokeball';
import { PokeStickers } from '@/components/PokeStickers';
import { Icon } from '@/components/Icon';
import { FadeIn } from '@/components/motion';
import { useNetwork } from '@/components/Providers';
import { clientConfig } from '@/lib/clientConfig';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((m) => m.WalletMultiButton),
  { ssr: false },
);

const FEATURES = [
  { ico: 'cards', h: 'Cards become Pokémon', p: 'Phygitals cNFTs sync via Helius DAS into battle-ready monsters.' },
  { ico: 'sword', h: '6v6 Showdown battles', p: 'Server-authoritative matches with real-time wager negotiation.' },
  { ico: 'spark', h: 'Stake crypto or cards', p: 'Winner takes the pot — lose the bet, lose the card.' },
];

const SPOTLIGHT = ['charizard', 'pikachu', 'gengar'];
const sprite = (id: string) => `${clientConfig.spriteHost}/gen5ani/${id}.gif`;

function PhantomIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2C7 2 3 6 3 11c0 4.5 3.5 8.5 8 9.5.5.1 1-.3 1-.8v-2.5c0-.6.4-1 1-1h2c.6 0 1 .4 1 1v2.5c0 .5.5.9 1 .8 4.5-1 8-5 8-9.5C25 6 21 2 16 2h-4z" fill="#ab9ff2" />
    </svg>
  );
}

function SolflareIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#fc8c03" />
      <path d="M8 14l4-6 4 6H8z" fill="#fff" />
    </svg>
  );
}

export function LoginHero({
  pubkey,
  signedIn,
  signingIn,
  error,
  onSignIn,
}: {
  pubkey: string | null;
  signedIn: boolean;
  signingIn: boolean;
  error: string | null;
  onSignIn: () => void;
}) {
  const walletConnected = !!pubkey;
  const reduced = useReducedMotion();
  const network = useNetwork();
  const step = signedIn ? 2 : walletConnected ? 1 : 0;
  const netLabel =
    network?.mode === 'mainnet'
      ? 'Reading real cNFTs · mainnet-beta'
      : network?.mode === 'devnet'
        ? 'Reading real cNFTs · devnet'
        : 'Mock mode · demo collection';

  return (
    <div className="login-page fx-content">
      <PokeStickers count={6} interactive />
      <div className="login-split">
        <FadeIn className="login-hero-panel">
          <span className="kicker"><span className="live" /> Trainer login</span>
          <h1>Your cards.<br />Your arena.</h1>
          <p className="lede">
            Connect a Solana wallet, sign in once, and your Pokémon card cNFTs become your battle roster.
          </p>
          <div className="login-features">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.h}
                className="login-feature"
                initial={reduced ? false : { opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: reduced ? 0 : 0.1 + i * 0.08 }}
              >
                <span className="login-feature-ico"><Icon name={f.ico as 'cards'} size={18} /></span>
                <div>
                  <strong>{f.h}</strong>
                  <div className="muted" style={{ fontSize: 13 }}>{f.p}</div>
                </div>
              </motion.div>
            ))}
          </div>
          {clientConfig.enablePokemonArt && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="login-spotlight one" src={sprite(SPOTLIGHT[0]!)} alt="" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="login-spotlight two" src={sprite(SPOTLIGHT[1]!)} alt="" />
            </>
          )}
        </FadeIn>

        <FadeIn delay={0.12}>
          <div className="login-card-premium">
            <Pokeball size={72} className={signedIn ? 'wobble' : 'spin'} style={{ margin: '0 auto', display: 'block' }} />
            <h2>Enter the arena</h2>
            <p className="muted" style={{ textAlign: 'center', margin: '0 auto', maxWidth: 320, fontSize: 14 }}>
              Sign in with your Solana wallet to load cNFTs and start battling.
            </p>

            {network && (
              <div className="login-net" style={{ margin: '2px auto 0' }}>
                <span className={`pill ${network.mode}`}>
                  <span className={`dot ${network.onChain ? 'live' : ''}`} />
                  {network.mode}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>{netLabel}</span>
              </div>
            )}

            <div className="step-progress" aria-hidden>
              <span className={`step-progress-seg ${step >= 0 ? 'active' : ''} ${step > 0 ? 'done' : ''}`} />
              <span className={`step-progress-seg ${step >= 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`} />
            </div>

            <div className="login-steps">
              <div className={`login-step ${walletConnected ? 'done' : ''}`}>
                <span className="n">{walletConnected ? '✓' : '1'}</span>
                <div>
                  <strong>Connect wallet</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {walletConnected ? `${pubkey!.slice(0, 4)}…${pubkey!.slice(-4)}` : 'Phantom, Solflare & more'}
                  </div>
                </div>
              </div>
              <div className={`login-step ${signedIn ? 'done' : ''}`}>
                <span className="n">{signedIn ? '✓' : '2'}</span>
                <div>
                  <strong>Sign In With Solana</strong>
                  <div className="muted" style={{ fontSize: 12 }}>One-time nonce — no gas fee</div>
                </div>
              </div>
            </div>

            <div className="wallet-icons" aria-hidden>
              <span className="wallet-icon" title="Phantom"><PhantomIcon /></span>
              <span className="wallet-icon" title="Solflare"><SolflareIcon /></span>
            </div>

            <div className="stack" style={{ gap: 10 }}>
              <WalletMultiButton />
              <button
                className="btn accent block glow"
                onClick={onSignIn}
                disabled={!walletConnected || signingIn}
              >
                {signingIn ? 'Signing…' : signedIn ? 'Signed in ✓' : 'Sign In With Solana'}
              </button>
            </div>

            {error && <div className="alert danger" style={{ marginTop: 14 }}>{error}</div>}

            <div className="login-trust">
              <span className="login-trust-item"><Icon name="shield" size={14} /> Secured by SIWS</span>
              <span className="login-trust-item"><Icon name="bolt" size={14} /> No gas for sign-in</span>
            </div>

            <p className="muted" style={{ marginTop: 14, fontSize: 12, textAlign: 'center' }}>
              No cards yet? Buy on the <Link href="/market">devnet marketplace</Link>, <Link href="/add-card">add a card</Link>, or get cNFTs on{' '}
              <a href="https://magiceden.io/marketplace/phygitals" target="_blank" rel="noopener noreferrer">Magic Eden</a>.
            </p>
          </div>
        </FadeIn>
      </div>
    </div>
  );
}
