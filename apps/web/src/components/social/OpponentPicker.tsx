'use client';

import { useEffect, useRef, useState } from 'react';
import { apiClient, type FriendItem, type PublicUser } from '@/lib/api';
import { Icon } from '@/components/Icon';

const short = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`;

/**
 * Pick a battle opponent by USERNAME (no base58 address needed) — debounced
 * server search + a friends quick-pick row. Calls onSelect with the resolved
 * pubkey + display name. Friends are loaded once so you can challenge them in a tap.
 */
export function OpponentPicker({
  selectedPubkey,
  selectedName,
  onSelect,
  onClear,
}: {
  selectedPubkey: string;
  selectedName: string | null;
  onSelect: (pubkey: string, username: string | null) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PublicUser[]>([]);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    apiClient.listFriends().then((r) => setFriends(r.friends)).catch(() => {});
  }, []);

  useEffect(() => {
    if (q.trim().length < 1) { setResults([]); return; }
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(() => {
      apiClient
        .searchUsers(q.trim())
        .then((r) => { if (id === reqId.current) { setResults(r.users); setOpen(true); } })
        .catch(() => {})
        .finally(() => { if (id === reqId.current) setLoading(false); });
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  if (selectedPubkey) {
    const label = selectedName ? `@${selectedName}` : short(selectedPubkey);
    return (
      <div className="field">
        <label>Opponent</label>
        <div className="opp-chosen">
          <span className="opp-chosen-av">{(selectedName ?? '?').slice(0, 1).toUpperCase()}</span>
          <span className="opp-chosen-name">{label}</span>
          <span className="muted" style={{ fontSize: 12 }}>{short(selectedPubkey)}</span>
          <button type="button" className="btn ghost sm" onClick={onClear} style={{ marginLeft: 'auto' }}>
            <Icon name="close" size={14} /> Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="field" style={{ position: 'relative' }}>
      <label htmlFor="oppsearch">Opponent — search by username</label>
      <div className="opp-search">
        <Icon name="search" size={16} className="muted-ico" />
        <input
          id="oppsearch"
          className="input"
          placeholder="Type a trainer's username…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          autoComplete="off"
        />
        {loading && <span className="spinner" />}
      </div>

      {open && results.length > 0 && (
        <ul className="opp-results" role="listbox">
          {results.map((u) => (
            <li key={u.pubkey}>
              <button
                type="button"
                onClick={() => { onSelect(u.pubkey, u.username); setOpen(false); setQ(''); }}
              >
                <span className="opp-chosen-av">{(u.username ?? '?').slice(0, 1).toUpperCase()}</span>
                <span className="opp-result-main">
                  <b>@{u.username}</b>
                  <span className="muted">{short(u.pubkey)}</span>
                </span>
                <span className="badge">{u.rating}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && !loading && q.trim().length >= 1 && results.length === 0 && (
        <span className="muted" style={{ fontSize: 12 }}>No trainer named “{q.trim()}”. They may need to set a username.</span>
      )}

      {friends.length > 0 && (
        <div className="opp-friends">
          <span className="muted" style={{ fontSize: 12 }}>Friends:</span>
          {friends.slice(0, 6).map((f) => (
            <button
              key={f.pubkey}
              type="button"
              className="opp-friend-chip"
              onClick={() => onSelect(f.pubkey, f.username)}
              title={f.username ? `@${f.username}` : short(f.pubkey)}
            >
              {f.username ? `@${f.username}` : short(f.pubkey)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
