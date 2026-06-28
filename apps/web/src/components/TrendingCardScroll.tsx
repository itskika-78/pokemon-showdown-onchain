'use client';

import { useRef, useState } from 'react';
import { motion, useScroll, useSpring, useTransform, type MotionValue } from 'framer-motion';
import { clientConfig } from '@/lib/clientConfig';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Scroll-pinned cinematic (exebenus-style pin + rotate + zoom): a REAL trending
 * card floats out of a perspective floor, then the camera ZOOMS INTO the card so
 * you read what's on it, while branded overlay callouts annotate the details.
 * Clean, high-contrast, TCG palette — no neo-brutal offsets.
 */
const TRENDING = {
  name: 'Charizard',
  set: 'Base Set',
  year: '1999',
  number: '4 / 102',
  image: 'https://images.pokemontcg.io/base1/4_hires.png',
  spriteFallback: 'charizard',
  grade: 'PSA 10',
  price: '420.0',
};

/**
 * Stat overlays revealed as the camera zooms into the card face.
 * Each tag points to the matching region on the Charizard Base Set card:
 *   top 14% → name / HP line
 *   mid 46% → first attack
 *   mid 63% → second attack
 *   bot 80% → weakness / retreat row
 */
const TAGS = [
  { id: 'hp',   side: 'right', top: '14%', at: 0.26, label: '120 HP · Fire Type', sub: 'Stage 2 — evolves from Charmeleon' },
  { id: 'atk1', side: 'left',  top: '48%', at: 0.36, label: 'Energy Burn',        sub: '10× each Energy on Defending Pokémon' },
  { id: 'atk2', side: 'right', top: '63%', at: 0.46, label: 'Fire Spin · 100',   sub: 'Discard 2 🔥 Fire Energy' },
  { id: 'wkrs', side: 'left',  top: '80%', at: 0.56, label: 'Weakness: Water ×2', sub: 'Retreat Cost ●●●' },
] as const;

function Tag({ p, tag }: { p: MotionValue<number>; tag: (typeof TAGS)[number] }) {
  const o = useTransform(p, [tag.at, tag.at + 0.07], [0, 1]);
  const x = useTransform(p, [tag.at, tag.at + 0.09], [tag.side === 'left' ? -28 : 28, 0]);
  return (
    <motion.div className={`tcard-tag ${tag.side}`} style={{ opacity: o, x, top: tag.top }}>
      <span className="tcard-tag-dot" />
      <span className="tcard-tag-line" />
      <div className="tcard-tag-body">
        <span className="tcard-tag-label">{tag.label}</span>
        <span className="tcard-tag-sub">{tag.sub}</span>
      </div>
    </motion.div>
  );
}

function CardObject() {
  const [imgOk, setImgOk] = useState(true);
  return (
    <div className="tcard-real-wrap">
      <div className="tcard-real">
        {imgOk && clientConfig.enablePokemonArt ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={TRENDING.image} alt={`${TRENDING.name} — ${TRENDING.set}`} onError={() => setImgOk(false)} />
        ) : (
          <FallbackFace />
        )}
        <span className="tcard-shine" />
      </div>
      <div className="tcard-reflection" aria-hidden>
        {imgOk && clientConfig.enablePokemonArt ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={TRENDING.image} alt="" />
        ) : (
          <FallbackFace />
        )}
      </div>
    </div>
  );
}

function FallbackFace() {
  return (
    <div className="tcard-fallback">
      <div className="tcard-fallback-top"><span>{TRENDING.name}</span><span>{TRENDING.grade}</span></div>
      <div className="tcard-fallback-art">
        {clientConfig.enablePokemonArt && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${clientConfig.spriteHost}/gen5ani/${TRENDING.spriteFallback}.gif`} alt="" />
        )}
      </div>
      <div className="tcard-fallback-foot"><span>cNFT · {TRENDING.number}</span></div>
    </div>
  );
}

export function TrendingCardScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });

  // Card rotates in, then the camera zooms INTO it (no fade, no stats panel).
  const rotateY = useTransform(p, [0, 0.42], [-24, 0]);
  const rotateX = useTransform(p, [0, 0.42], [8, 0]);
  const cardScale = useTransform(p, [0, 0.4, 1], [0.82, 1.18, 1.82]);
  const cardY = useTransform(p, [0, 0.4, 1], [0, -6, -24]);
  const ringRotate = useTransform(p, [0, 1], [0, 220]);
  const ringOpacity = useTransform(p, [0, 0.32, 0.6], [0.18, 0.8, 0]);
  const glowScale = useTransform(p, [0, 0.6], [0.9, 1.5]);
  const lineO = useTransform(p, [0, 0.18, 0.5], [0, 1, 0]);

  const headO = useTransform(p, [0, 0.16], [0, 1]);
  const headY = useTransform(p, [0, 0.16], [26, 0]);
  const hintO = useTransform(p, [0, 0.12, 0.4], [0.8, 0.8, 0]);

  // Closing brand statement.
  const brandO = useTransform(p, [0.76, 0.88], [0, 1]);
  const brandY = useTransform(p, [0.76, 0.92], [22, 0]);

  if (reduced) {
    return (
      <section className="tcard-scroll reduced">
        <div className="tcard-sticky">
          <div className="tcard-bg" />
          <p className="tcard-kicker"><span className="tcard-live" /> #1 Trending · Live</p>
          <div className="tcard-stage">
            <div className="tcard-platform"><span className="tcard-line l1" /><span className="tcard-line l2" /></div>
            <div className="tcard-3d"><CardObject /></div>
          </div>
          <p className="tcard-brand-line static">Your grail card is a monster. <b>Prove it.</b></p>
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} className="tcard-scroll">
      <div className="tcard-sticky">
        <div className="tcard-bg" />

        <motion.p className="tcard-kicker" style={{ opacity: headO, y: headY }}>
          <span className="tcard-live" /> Base Set 1999 · {TRENDING.name} · {TRENDING.grade}
        </motion.p>

        <motion.div className="tcard-glow" style={{ scale: glowScale, opacity: ringOpacity }} />

        <motion.div className="tcard-stage" style={{ scale: cardScale, y: cardY }}>
          <motion.div className="tcard-rings" style={{ rotate: ringRotate, opacity: ringOpacity }} />
          <motion.div className="tcard-rings two" style={{ rotate: ringRotate, opacity: ringOpacity }} />
          {[...Array(6)].map((_, i) => (
            <span key={i} className={`tcard-spark s${i}`} />
          ))}

          <motion.div className="tcard-platform" style={{ opacity: lineO }}>
            <span className="tcard-line l1" />
            <span className="tcard-line l2" />
          </motion.div>

          <motion.div className="tcard-3d" style={{ rotateY, rotateX }}>
            <CardObject />
          </motion.div>
        </motion.div>

        {/* branded overlay callouts annotating the zoomed card */}
        <div className="tcard-tags" aria-hidden>
          {TAGS.map((t) => (
            <Tag key={t.id} p={p} tag={t} />
          ))}
        </div>

        <motion.p className="tcard-brand-line" style={{ opacity: brandO, y: brandY }}>
          Your card is a fighter. <b>Battle for it on-chain.</b>
        </motion.p>

        <motion.span className="tcard-hint" style={{ opacity: hintO }}>Scroll to inspect ↓</motion.span>
      </div>
    </section>
  );
}
