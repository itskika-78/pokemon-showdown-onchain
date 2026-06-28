'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/components/Providers';
import { apiClient, type FriendItem } from '@/lib/api';
import { PageShell, PageHero, Panel, Button } from '@/components/ui';
import { UsernamePanel } from '@/components/social/UsernamePanel';
import { Icon } from '@/components/Icon';

const short = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`;

export default function FriendsPage() {
  const { signedIn } = useSession();
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [addr, setAddr] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    apiClient.listFriends().then((r) => { setFriends(r.friends); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  useEffect(() => { if (signedIn) load(); }, [signedIn, load]);

  const add = async () => {
    const value = addr.trim();
    if (!value) return;
    setBusy(true);
    setErr(null);
    try {
      // accept either a wallet address or a @username
      const input = value.startsWith('@') ? { username: value.slice(1) } : { pubkey: value };
      await apiClient.addFriend(input);
      setAddr('');
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add friend.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (pubkey: string) => {
    await apiClient.removeFriend(pubkey).catch(() => {});
    setFriends((f) => f.filter((x) => x.pubkey !== pubkey));
  };

  if (!signedIn) {
    return (
      <PageShell stickers={2}>
        <PageHero kicker="Trainers" title="Friends" subtitle="Sign in to add friends and challenge them." />
        <p className="muted">Connect your wallet and sign in to manage friends.</p>
      </PageShell>
    );
  }

  return (
    <PageShell stickers={3}>
      <PageHero
        kicker="Trainers"
        title="Friends"
        subtitle="Add trainers by wallet address, give yourself a username, and challenge friends in a tap. Each friend is shown by their username."
      />

      <UsernamePanel />

      <Panel variant="game" pad="lg" className="stack" style={{ maxWidth: 760, marginTop: 18 }}>
        <div>
          <h3 style={{ margin: '0 0 4px' }}>Add a friend</h3>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Adding a friend needs their <strong>wallet address</strong> (or their @username if they have one).
          </p>
        </div>
        <div className="field">
          <label htmlFor="addfriend">Wallet address or @username</label>
          <div className="row" style={{ gap: 8 }}>
            <input
              id="addfriend"
              className="input"
              placeholder="Their Solana address (base58) or @username"
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void add()}
            />
            <Button variant="accent" onClick={() => void add()} disabled={busy || addr.trim().length < 2}>
              {busy ? 'Adding…' : 'Add friend'}
            </Button>
          </div>
          {err && <span className="muted" style={{ fontSize: 12, color: 'var(--danger)' }}>{err}</span>}
        </div>
      </Panel>

      <Panel variant="game" pad="lg" className="stack" style={{ maxWidth: 760, marginTop: 18 }}>
        <div className="row between">
          <h3 style={{ margin: 0 }}>Your friends</h3>
          <span className="badge">{friends.length}</span>
        </div>
        {!loaded ? (
          <p className="muted"><span className="spinner" /> Loading…</p>
        ) : friends.length === 0 ? (
          <p className="muted" style={{ fontSize: 14 }}>No friends yet — add a trainer by their wallet address above.</p>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            {friends.map((f) => (
              <div className="friend-row" key={f.pubkey}>
                <span className="friend-av">{(f.username ?? '?').slice(0, 1).toUpperCase()}</span>
                <span className="friend-meta">
                  <span className="friend-name">{f.username ? `@${f.username}` : 'Unnamed trainer'}</span>
                  <span className="friend-addr">{short(f.pubkey)} · {f.rating} ELO</span>
                </span>
                <Link href={`/battle?opp=${encodeURIComponent(f.pubkey)}${f.username ? `&name=${encodeURIComponent(f.username)}` : ''}`} className="btn accent sm">
                  <Icon name="sword" size={14} /> Battle
                </Link>
                <button type="button" className="btn ghost sm" onClick={() => void remove(f.pubkey)} aria-label="Remove friend">
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </PageShell>
  );
}
