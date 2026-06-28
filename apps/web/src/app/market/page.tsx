'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, VersionedTransaction } from '@solana/web3.js';
import { useSession, useNetwork } from '@/components/Providers';
import { apiClient, type CollectionStats, type RosterCard } from '@/lib/api';
import { clientCache } from '@/lib/clientCache';
import { Sparkline } from '@/components/Sparkline';
import { PageShell, PageHero, EmptyState, Button, Pill } from '@/components/ui';
import { StaggerChildren, StaggerItem, HoverLift } from '@/components/motion';

function MarketOverview({ stats }: { stats: CollectionStats | null }) {
  if (!stats) {
    return (
      <div className="market-overview skeleton" style={{ minHeight: 140 }} aria-hidden />
    );
  }
  const fmt = (v: number | null, suffix = '') => (v == null ? '—' : `${v.toLocaleString()}${suffix}`);
  const floorChange = stats.floorSpark.length > 1
    ? Math.round(((stats.floorSpark[stats.floorSpark.length - 1]! - stats.floorSpark[0]!) / (stats.floorSpark[0]! || 1)) * 1000) / 10
    : 0;
  const up = floorChange >= 0;
  return (
    <div className="market-overview">
      <div className="mo-head">
        <div>
          <span className="mo-kicker">Collection floor · {stats.symbol}</span>
          <div className="mo-floor">
            <span className="mo-floor-val">{stats.floorSol != null ? `${stats.floorSol} ◎` : 'No listings'}</span>
            <span className={`mo-change ${up ? 'up' : 'down'}`}>{up ? '▲' : '▼'} {Math.abs(floorChange)}%</span>
          </div>
        </div>
        <span className={`mo-source ${stats.source}`}>
          {stats.source === 'magiceden' ? 'Live · Magic Eden' : 'Indicative'}
        </span>
      </div>
      <div className="mo-chart">
        <Sparkline data={stats.floorSpark} width={520} height={64} positive={up} strokeWidth={2.5} />
      </div>
      <div className="mo-stats">
        <div className="mo-stat"><span className="mo-stat-val">{fmt(stats.listedCount)}</span><span className="mo-stat-lbl">Listed</span></div>
        <div className="mo-stat"><span className="mo-stat-val">{fmt(stats.volumeAllSol, ' ◎')}</span><span className="mo-stat-lbl">Volume (all)</span></div>
        <div className="mo-stat"><span className="mo-stat-val">{fmt(stats.avgPrice24hrSol, ' ◎')}</span><span className="mo-stat-lbl">Avg 24h</span></div>
      </div>
    </div>
  );
}

export default function MarketPage() {
  const { signedIn } = useSession();
  const net = useNetwork();
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [cards, setCards] = useState<RosterCard[]>(() => {
    const c = clientCache.getMarket();
    return (c?.cards as RosterCard[]) ?? [];
  });
  const [marketMode, setMarketMode] = useState<'devnet' | 'mainnet-owned'>(() => {
    const c = clientCache.getMarket();
    return (c?.marketMode as 'devnet' | 'mainnet-owned') ?? 'devnet';
  });
  const [stats, setStats] = useState<CollectionStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'good' | 'bad'; text: string } | null>(null);

  const isDevnet = net?.mode === 'devnet' || marketMode === 'devnet';
  const isMainnet = net?.mode === 'mainnet' || marketMode === 'mainnet-owned';

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    apiClient
      .marketList(1)
      .then((r) => {
        setCards(r.cards);
        setMarketMode(r.marketMode);
        clientCache.setMarket({ cards: r.cards, marketMode: r.marketMode });
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load roster'))
      .finally(() => setLoading(false));
  }, []);

  const buyDevnet = useCallback(async (card: RosterCard) => {
    setToast(null);
    if (!publicKey || !sendTransaction || !card.listingId) {
      setToast({ kind: 'bad', text: 'Connect your wallet first.' });
      return;
    }
    setBuyingId(card.listingId);
    try {
      const { txBase64, versioned } = await apiClient.devnetBuyTx(card.listingId);
      const raw = Uint8Array.from(atob(txBase64), (c) => c.charCodeAt(0));
      const tx = versioned ? VersionedTransaction.deserialize(raw) : Transaction.from(raw);
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, 'confirmed');
      await apiClient.devnetBuyConfirm(card.listingId, sig);
      window.dispatchEvent(new Event('balance-refresh'));
      window.dispatchEvent(new Event('das-settings-changed'));
      setToast({ kind: 'good', text: `Bought ${card.name}! Stock updated — card added to your collection.` });
      load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Purchase failed';
      setToast({ kind: 'bad', text: /user rejected|rejected the request/i.test(m) ? 'You declined the transaction.' : m });
    } finally {
      setBuyingId(null);
    }
  }, [publicKey, sendTransaction, connection, load]);

  useEffect(() => {
    if (!signedIn) return;
    load();
  }, [signedIn, load, net?.mode]);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    const pull = () => apiClient.marketStats().then((s) => alive && setStats(s)).catch(() => {});
    pull();
    const id = setInterval(pull, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [signedIn]);

  if (!signedIn) {
    return (
      <PageShell stickers={3}>
        <EmptyState title="Sign in to browse the market" actions={<Button href="/login" variant="accent">Login</Button>} />
      </PageShell>
    );
  }

  return (
    <PageShell stickers={4}>
      <PageHero
        kicker={isMainnet ? 'Your collection' : 'Trending cards'}
        title={isMainnet ? 'Your Cards' : 'Devnet Marketplace'}
        subtitle={
          isMainnet
            ? 'On mainnet, cards you own appear here. To buy new Phygitals cNFTs, visit Magic Eden or Phygitals — purchases happen on those marketplaces.'
            : 'Trending Phygitals-style cards with limited stock. Pay with devnet SOL — stock decreases as trainers buy. Cards land in your collection and are battle-ready.'
        }
        actions={net ? <Pill mode={net.mode}>{net.cluster}</Pill> : undefined}
      />

      <MarketOverview stats={stats} />

      <div className="alert info" style={{ marginBottom: 16 }}>
        {isDevnet ? (
          <>Devnet marketplace — prices mirror the real market. Each listing has <strong>limited stock</strong> that decreases when purchased with devnet SOL.</>
        ) : (
          <>Mainnet shows <strong>cards you already own</strong>. To acquire more, buy on{' '}
            <a href="https://magiceden.io/marketplace/phygitals" target="_blank" rel="noopener noreferrer">Magic Eden</a>
            {' '}or{' '}
            <a href="https://phygitals.com/marketplace" target="_blank" rel="noopener noreferrer">Phygitals</a>.
          </>
        )}
      </div>

      {toast && (
        <div className={`alert ${toast.kind === 'good' ? 'good' : 'danger'}`}>
          {toast.text} {toast.kind === 'good' && <Link href="/collection">View collection →</Link>}
        </div>
      )}
      {err && <div className="alert danger">{err}</div>}

      {loading && cards.length === 0 ? (
        <div className="market-grid skeleton-grid" aria-hidden>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="market-card skeleton" style={{ minHeight: 280 }} />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <EmptyState
          title={isMainnet ? 'No owned cards yet' : 'No listings available'}
          description={
            isMainnet
              ? 'Connect a wallet with Phygitals cNFTs, or buy on Magic Eden / Phygitals.'
              : 'All trending cards may be sold out — check back later.'
          }
          actions={
            isMainnet ? (
              <>
                <a className="btn accent" href="https://magiceden.io/marketplace/phygitals" target="_blank" rel="noopener noreferrer">Magic Eden</a>
                <a className="btn secondary" href="https://phygitals.com/marketplace" target="_blank" rel="noopener noreferrer">Phygitals</a>
              </>
            ) : (
              <Button variant="secondary" onClick={load}>Refresh</Button>
            )
          }
        />
      ) : (
        <StaggerChildren className="market-grid" immediate>
          {cards.map((c) => (
            <StaggerItem key={c.mint}>
              <HoverLift as="article">
                <div className="market-card">
                  <div className="market-img">
                    {c.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.image} alt={c.name} loading="lazy" style={{ width: '100%', maxWidth: 150, height: 'auto', objectFit: 'contain' }} />
                    ) : (
                      <div className="unsup-fallback" aria-hidden>{(c.name[0] ?? '?').toUpperCase()}</div>
                    )}
                  </div>
                  <div className="market-body">
                    <strong className="market-name" title={c.name}>{c.name}</strong>
                    <span className="muted market-sub">
                      <span className="chip-playable">Battle-ready</span>
                      {c.stockRemaining != null && (
                        <> · <strong>{c.stockRemaining}</strong>{c.stockTotal != null ? ` / ${c.stockTotal}` : ''} left</>
                      )}
                    </span>
                    <div className="market-spark">
                      <Sparkline data={c.spark} width={150} height={34} positive={c.changePct >= 0} />
                      <span className={`spark-change ${c.changePct >= 0 ? 'up' : 'down'}`}>
                        {c.changePct >= 0 ? '▲' : '▼'} {Math.abs(c.changePct)}%
                      </span>
                    </div>
                    <div className="market-price">
                      {c.priceSol != null ? (
                        <span className="price-sol">{c.priceSol} ◎</span>
                      ) : (
                        <span className="price-unlisted">Owned</span>
                      )}
                    </div>
                    {c.canBuyInApp && c.listingId ? (
                      <button
                        type="button"
                        className="btn accent sm block"
                        onClick={() => void buyDevnet(c)}
                        disabled={buyingId === c.listingId || (c.stockRemaining ?? 0) <= 0}
                      >
                        {buyingId === c.listingId ? 'Confirm in wallet…' : c.stockRemaining === 0 ? 'Sold out' : `Buy · ${c.priceSol} ◎`}
                      </button>
                    ) : isMainnet ? (
                      <div className="stack" style={{ gap: 6 }}>
                        <a className="btn accent sm block" href={c.magicEdenUrl ?? c.buyUrl} target="_blank" rel="noopener noreferrer">
                          View on Magic Eden
                        </a>
                        <a className="btn secondary sm block" href={c.phygitalsUrl ?? 'https://phygitals.com/marketplace'} target="_blank" rel="noopener noreferrer">
                          View on Phygitals
                        </a>
                      </div>
                    ) : (
                      <span className="btn secondary sm block" style={{ opacity: 0.6, pointerEvents: 'none' }}>Sold out</span>
                    )}
                  </div>
                </div>
              </HoverLift>
            </StaggerItem>
          ))}
        </StaggerChildren>
      )}
    </PageShell>
  );
}
