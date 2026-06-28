'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/components/Providers';
import { useAppData } from '@/components/AppDataProvider';
import { CardTile } from '@/components/CardTile';
import { UnsupportedTile } from '@/components/UnsupportedTile';
import { PageShell, PageHero, EmptyState, Button, Badge } from '@/components/ui';
import { StaggerChildren, StaggerItem, HoverLift } from '@/components/motion';

type Sort = 'name' | 'level' | 'rarity';

export default function CollectionPage() {
  const { signedIn } = useSession();
  const { assets: data, syncing, refreshAssets } = useAppData();
  const [err, setErr] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('level');
  const [selectedSet, setSelectedSet] = useState<string>('all');

  const sets = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.cards.map((c) => c.set).filter(Boolean))] as string[];
  }, [data]);

  const cards = useMemo(() => {
    if (!data) return [];
    let list = [...data.cards];
    if (selectedSet !== 'all') list = list.filter((c) => c.set === selectedSet);
    list.sort((a, b) => {
      if (sort === 'name') return a.cardName.localeCompare(b.cardName);
      if (sort === 'rarity') return (b.rarity ?? '').localeCompare(a.rarity ?? '');
      const la = data.profiles[a.assetId]?.level ?? 0;
      const lb = data.profiles[b.assetId]?.level ?? 0;
      return lb - la;
    });
    return list;
  }, [data, selectedSet, sort]);

  const refresh = () => {
    setErr(null);
    void refreshAssets(true).catch((e) =>
      setErr(e instanceof Error ? e.message : 'Failed to refresh'),
    );
  };

  if (!signedIn) {
    return (
      <PageShell stickers={3}>
        <EmptyState
          title="Connect your wallet"
          description="Sign in to load your Pokémon card cNFTs from your wallet."
          actions={<Button href="/login" variant="accent" glow>Go to login</Button>}
        />
      </PageShell>
    );
  }

  const unsupported = data?.unsupported ?? [];
  const total = (data?.cards.length ?? 0) + unsupported.length;

  return (
    <PageShell stickers={3}>
      <PageHero
        kicker="Your wallet"
        title="Collection"
        subtitle={syncing && !data ? 'Syncing from chain…' : 'Battle-ready cards and other wallet assets.'}
        stats={data ? [
          { value: String(total), label: 'Wallet assets' },
          { value: String(data.cards.length), label: 'Battle-ready' },
          { value: String(unsupported.length), label: 'Not supported' },
        ] : undefined}
        actions={
          <>
            <Button href="/add-card" variant="ghost" size="sm">+ Add card</Button>
            <Button variant="secondary" size="sm" onClick={refresh} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync chain'}
            </Button>
            {err && <Badge style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>{err}</Badge>}
          </>
        }
      />

      {!data ? (
        <div className="grid skeleton-grid" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="card-tile skeleton" style={{ minHeight: 220 }} />
          ))}
        </div>
      ) : (
        <>
          {data.cards.length > 0 && (
            <div className="row wrap" style={{ gap: 12, marginBottom: 16 }}>
              <label className="row" style={{ gap: 6 }}>
                <span className="muted" style={{ fontSize: 13 }}>Sort</span>
                <select className="input sm" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  <option value="level">Level</option>
                  <option value="name">Name</option>
                  <option value="rarity">Rarity</option>
                </select>
              </label>
              {sets.length > 1 && (
                <label className="row" style={{ gap: 6 }}>
                  <span className="muted" style={{ fontSize: 13 }}>Set</span>
                  <select className="input sm" value={selectedSet} onChange={(e) => setSelectedSet(e.target.value)}>
                    <option value="all">All sets</option>
                    {sets.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}

          {cards.length === 0 && unsupported.length === 0 ? (
            <EmptyState
              title="No cards yet"
              description="Buy from the devnet market, add a card manually, or sync after acquiring cNFTs."
              actions={
                <>
                  <Button href="/market" variant="accent">Marketplace</Button>
                  <Button href="/add-card" variant="secondary">Add card</Button>
                </>
              }
            />
          ) : (
            <>
              {cards.length > 0 && (
                <StaggerChildren className="grid">
                  {cards.map((c) => (
                    <StaggerItem key={c.assetId}>
                      <HoverLift>
                        <CardTile card={c} profile={data.profiles[c.assetId]} />
                      </HoverLift>
                    </StaggerItem>
                  ))}
                </StaggerChildren>
              )}
              {unsupported.length > 0 && (
                <>
                  <h3 style={{ marginTop: 32 }}>Not supported</h3>
                  <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
                    Other assets in your wallet that cannot battle.
                  </p>
                  <StaggerChildren className="grid">
                    {unsupported.map((u) => (
                      <StaggerItem key={u.assetId}>
                        <UnsupportedTile asset={u} />
                      </StaggerItem>
                    ))}
                  </StaggerChildren>
                </>
              )}
            </>
          )}
        </>
      )}
    </PageShell>
  );
}
