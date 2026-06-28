'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Sprites } from '@pkmn/img';
import { useSession } from '@/components/Providers';
import { useAppData } from '@/components/AppDataProvider';
import { apiClient } from '@/lib/api';
import { clientCache } from '@/lib/clientCache';
import { CardTile } from '@/components/CardTile';
import { PageShell, PageHero, EmptyState, Button, Badge } from '@/components/ui';
import { StaggerChildren, StaggerItem, HoverLift } from '@/components/motion';
import { Icon } from '@/components/Icon';
import { clientConfig } from '@/lib/clientConfig';

function miniSprite(speciesId: string): string {
  try {
    return Sprites.getPokemon(speciesId, { gen: 'gen5ani' }).url;
  } catch {
    return `${clientConfig.spriteHost}/gen5ani/${speciesId}.gif`;
  }
}

export default function TeamPage() {
  const { signedIn } = useSession();
  const { assets: data, teamIds: selected, setTeamIds: setSelected, refreshTeam } = useAppData();
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (assetId: string, playable: boolean) => {
    if (!playable) return;
    setStatus(null);
    setSelected((cur) => {
      if (cur.includes(assetId)) return cur.filter((id) => id !== assetId);
      if (cur.length >= 6) return cur;
      return [...cur, assetId];
    });
  };

  const save = async () => {
    setStatus(null);
    setErr(null);
    try {
      await apiClient.setTeam(selected);
      clientCache.setTeam({ assetIds: selected });
      setStatus('Team saved ✓');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    }
  };

  if (!signedIn) {
    return (
      <PageShell stickers={3}>
        <EmptyState
          title="Sign in to build your team"
          actions={<Button href="/login" variant="accent">Login</Button>}
        />
      </PageShell>
    );
  }

  const playableCards = data?.cards.filter((c) => c.playable) ?? [];
  const partySlots = Array.from({ length: 6 }, (_, i) => selected[i] ?? null);

  return (
    <PageShell stickers={4}>
      <PageHero
        kicker="Party builder"
        title="Team"
        subtitle="Pick up to six playable cards. The server re-derives your team at match start."
        stats={[
          { value: `${selected.length}/6`, label: 'Selected' },
          { value: String(playableCards.length), label: 'Available' },
        ]}
        actions={
          <>
            {status && <Badge variant="good">{status}</Badge>}
            {err && <Badge style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>{err}</Badge>}
            <Button variant="secondary" size="sm" onClick={() => void refreshTeam()}>Refresh</Button>
            <Button variant="accent" onClick={save} disabled={selected.length === 0}>Save team</Button>
          </>
        }
      />

      <div className="stake-reminder">
        <Icon name="shield" size={18} />
        Cards staked in wager battles are locked until the match ends.
      </div>

      <div className="party-bar" aria-label="Your party of six">
        {partySlots.map((assetId, i) => {
          const card = assetId && data ? data.cards.find((c) => c.assetId === assetId) : null;
          const sprite = card?.speciesId ? miniSprite(card.speciesId) : null;
          return (
            <div key={i} className={`party-slot ${card ? 'filled' : 'empty'}`} title={card?.cardName ?? `Slot ${i + 1}`}>
              {sprite && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sprite} alt={card!.speciesId ?? ''} />
              )}
              <span className="party-slot-num">{i + 1}</span>
            </div>
          );
        })}
      </div>

      {!data ? (
        <div className="grid skeleton-grid" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="card-tile skeleton" style={{ minHeight: 220 }} />
          ))}
        </div>
      ) : playableCards.length === 0 ? (
        <EmptyState
          title="No playable cards"
          description={
            <>
              <Link href="/add-card">Add a card</Link> or check <Link href="/settings">Settings</Link>.
            </>
          }
          actions={<Button href="/add-card" variant="accent">Add a card</Button>}
        />
      ) : (
        <StaggerChildren className="grid">
          {playableCards.map((c) => (
            <StaggerItem key={c.assetId}>
              <HoverLift>
                <CardTile
                  card={c}
                  profile={data.profiles[c.assetId]}
                  selected={selected.includes(c.assetId)}
                  ribbon={selected.includes(c.assetId) ? 'In team' : undefined}
                  onClick={() => toggle(c.assetId, c.playable)}
                />
              </HoverLift>
            </StaggerItem>
          ))}
        </StaggerChildren>
      )}
    </PageShell>
  );
}
