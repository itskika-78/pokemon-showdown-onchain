'use client';

import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { useNetwork } from '@/components/Providers';
import { clientConfig } from '@/lib/clientConfig';

/**
 * OVERWORLD — 16-bit pixel-art editorial landing. Warm parchment, chunky blocky
 * pixel display type, tilted hand-applied sprite cards with hard ink borders +
 * offset shadows, pixel badges, editorial micro-labels. Scoped under `.ow`.
 */

const sprite = (id: string) => `${clientConfig.spriteHost}/gen5ani/${id}.gif`;

const CARDS = [
  { id: 'bulbasaur', badge: 'STARTER', badgeClass: 'green', tilt: 't1', no: 'NO. 001', sky: 'linear-gradient(180deg,#8fc7e8 0 55%,#6fae4f 55% 100%)' },
  { id: 'charizard', badge: '★ HOT DROP', badgeClass: 'red', tilt: 't2', no: 'NO. 006', sky: 'linear-gradient(180deg,#f6b24a 0 45%,#e8472b 45% 70%,#7a2b16 70% 100%)' },
  { id: 'blastoise', badge: '⌂ SETTLED', badgeClass: 'blue', tilt: 't3', no: 'NO. 009', sky: 'linear-gradient(180deg,#9fd0ec 0 55%,#3e7d3a 55% 100%)' },
] as const;

const FEATURES = [
  { icon: 'wallet', bg: '#2f6fd6', h: 'Sign in w/ Solana', p: 'One signature proves the wallet. Your card cNFTs never leave your custody.' },
  { icon: 'cards', bg: '#e8472b', h: 'Cards → fighters', p: 'Every Phygitals card is read on-chain and derived into a battle-ready Pokémon. Same card, same fighter, forever.' },
  { icon: 'sword', bg: '#3e7d3a', h: '6v6 onchain', p: '100% server-authoritative Showdown battles vs real trainers. A hostile client can never cheat.' },
  { icon: 'trophy', bg: '#e6a32c', h: 'Wager SOL or cards', p: 'Random-match by stake or challenge a friend. Put SOL — or the card itself — on the line.' },
] as const;

const STEPS = [
  { n: '01', h: 'Connect', p: 'Sign In With Solana. Your collection loads from the chain.' },
  { n: '02', h: 'Draft six', p: 'Pick a squad of six playable cards. The server re-derives it at match start.' },
  { n: '03', h: 'Find a foe', p: 'Random SOL wager match or challenge a trainer by username.' },
  { n: '04', h: 'Win the pot', p: 'Take the SOL — or the staked card. Settlement runs behind one interface.' },
] as const;

const STATS = [
  { v: '6v6', l: 'Showdown battles' },
  { v: '100%', l: 'Server-authoritative' },
  { v: 'cNFT', l: 'True ownership' },
  { v: '◎ SOL', l: 'Escrowed wagers' },
] as const;

export default function HomePage() {
  const network = useNetwork();
  const net = network?.mode === 'mainnet' ? 'MAINNET' : 'DEVNET';

  return (
    <div className="ow">
      <div className="ow-bg" aria-hidden><span className="ow-burst" /></div>

      <div className="ow-wrap">
        {/* editorial strip */}
        <div className="ow-strip">
          <div className="ow-strip-side"><span>Field manual</span><span>Sector one</span></div>
          <div className="ow-strip-side"><span style={{ color: 'var(--ow-ink)' }}>EST. 1996</span><span style={{ color: 'var(--ow-ink)' }}>ISSUE № 42</span></div>
        </div>

        {/* hero */}
        <section className="ow-hero">
          <p className="ow-eyebrow">
            <span className="sq" /> POKÉMON SHOWDOWN <span className="sep">//</span> ONCHAIN <span className="sep">//</span> <b>{net}</b> <span className="sep">//</span> 16-BIT ARENA
          </p>
          <h1 className="ow-title">
            SHOW<span className="dot" />DOWN<span className="period">.</span>
          </h1>
          <p className="ow-lede">
            Turn the Pokémon card cNFTs in your Solana wallet into a real, battle-ready squad. Chunky
            16-bit fighters punch through a full on-chain arena — <strong>win the battle, win the card.</strong>
          </p>
          <div className="ow-cta">
            <Link href="/login" className="ow-btn ow-btn-blue"><Icon name="bolt" size={16} /> Connect &amp; play</Link>
            <Link href="/pokedex" className="ow-btn ow-btn-ghost"><Icon name="search" size={16} /> Open the Pokédex</Link>
            <Link href="/battle" className="ow-btn ow-btn-red"><Icon name="sword" size={16} /> Enter the arena</Link>
          </div>
        </section>

        {/* tilted sprite cards */}
        <section className="ow-cards">
          {CARDS.map((c) => (
            <figure className={`ow-card ${c.tilt}`} key={c.id}>
              <span className={`ow-badge ${c.badgeClass}`}>{c.badge}</span>
              <div className="ow-card-frame">
                <div className="ow-card-scene" style={{ background: c.sky }}>
                  {clientConfig.enablePokemonArt && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sprite(c.id)} alt={c.id} />
                  )}
                </div>
                <figcaption className="ow-card-foot"><span>{c.id.toUpperCase()}</span><span>{c.no}</span></figcaption>
              </div>
            </figure>
          ))}
        </section>

        {/* features */}
        <section className="ow-sec">
          <div className="ow-sec-head">
            <span className="ow-sec-kicker">■ THE SYSTEM</span>
            <h2 className="ow-h2">Built like a real TCG</h2>
            <span className="ow-rule" />
          </div>
          <div className="ow-feats">
            {FEATURES.map((f, i) => (
              <article className="ow-feat" key={f.h}>
                <span className="ow-feat-n">0{i + 1}</span>
                <span className="ow-feat-ico" style={{ background: f.bg }}><Icon name={f.icon} size={22} /></span>
                <h3 className="ow-feat-h">{f.h}</h3>
                <p className="ow-feat-p">{f.p}</p>
              </article>
            ))}
          </div>
        </section>

        {/* steps */}
        <section className="ow-sec">
          <div className="ow-sec-head">
            <span className="ow-sec-kicker">■ QUEST LOG</span>
            <h2 className="ow-h2">Wallet → arena</h2>
            <span className="ow-rule" />
          </div>
          <div className="ow-steps">
            {STEPS.map((s) => (
              <div className="ow-step" key={s.n}>
                <div className="ow-step-n">{s.n}</div>
                <h3 className="ow-step-h">{s.h}</h3>
                <p className="ow-step-p">{s.p}</p>
              </div>
            ))}
          </div>
        </section>

        {/* stats */}
        <section className="ow-sec" style={{ paddingTop: 0 }}>
          <div className="ow-stats">
            {STATS.map((s) => (
              <div className="ow-stat" key={s.l}><b>{s.v}</b><span>{s.l}</span></div>
            ))}
          </div>
        </section>

        {/* finale */}
        <section className="ow-finale">
          <p className="ow-eyebrow" style={{ color: '#d8cfba' }}><span className="sq" /> READY PLAYER ONE</p>
          <h2>Your card is a monster<span className="dot">.</span></h2>
          <p>Connect your wallet, draft your six, and step into the 16-bit arena — friendly ladders or real SOL wagers on the line.</p>
          <div className="ow-cta" style={{ justifyContent: 'center' }}>
            <Link href="/login" className="ow-btn ow-btn-red"><Icon name="bolt" size={16} /> Connect wallet</Link>
            <Link href="/battle" className="ow-btn ow-btn-ghost" style={{ color: 'var(--ow-ink)' }}><Icon name="sword" size={16} /> Enter arena</Link>
          </div>
        </section>

        {/* footer */}
        <footer className="ow-footer">
          <span>© {new Date().getFullYear()} Pokémon Showdown Onchain · 16-bit edition</span>
          <span>Built on Solana · <Link href="/pokedex">Atlas</Link> · <Link href="/market">Market</Link> · <Link href="/friends">Friends</Link></span>
        </footer>
      </div>
    </div>
  );
}
