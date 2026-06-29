'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Sprites } from '@pkmn/img';
import { useSession } from '@/components/Providers';
import { apiClient, type DasNetwork, type MockCard, type TcgCard } from '@/lib/api';
import { Icon } from '@/components/Icon';

const GRADERS = ['', 'PSA', 'BGS', 'CGC', 'SGC'];

function spriteUrl(speciesId: string): string {
  try {
    return Sprites.getPokemon(speciesId, { gen: 'gen5ani' }).url;
  } catch {
    return '';
  }
}

export default function AddCardPage() {
  const { signedIn } = useSession();
  const [mode, setMode] = useState<DasNetwork | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TcgCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<TcgCard | null>(null);
  const [grade, setGrade] = useState('9');
  const [grader, setGrader] = useState('PSA');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; speciesId: string; level?: number; playable: boolean; reason?: string; image?: string } | null>(null);
  const [list, setList] = useState<MockCard[]>([]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshList = useCallback(() => {
    apiClient.listMockCards().then((r) => setList(r.cards)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    apiClient.getSettings().then((s) => setMode(s.mode)).catch(() => {});
    refreshList();
  }, [signedIn, refreshList]);

  // Debounced real-card search — you can only add cards that actually exist.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    debounce.current = setTimeout(() => {
      apiClient
        .tcgSearch(q)
        .then((r) => setResults(r.cards))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 280);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query]);

  const addPicked = async () => {
    if (!picked) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const r = await apiClient.addMockCard({
        name: picked.name,
        rarity: picked.rarity ?? undefined,
        year: picked.year ?? undefined,
        set: picked.set ?? undefined,
        cardNumber: picked.number ?? undefined,
        image: picked.thumb || picked.image,
        grade,
        gradingCompany: grader,
      });
      if (!r.playable || !r.speciesId) {
        setResult({ name: picked.name, speciesId: '', playable: false, reason: r.parseFailReason, image: picked.image });
      } else {
        const assets = await apiClient.assets();
        const lvl = assets.profiles[r.card.assetId]?.level;
        setResult({ name: picked.name, speciesId: r.speciesId, level: lvl, playable: true, image: picked.image });
      }
      setPicked(null);
      setQuery('');
      setResults([]);
      refreshList();
      window.dispatchEvent(new Event('balance-refresh'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to add card');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (assetId: string) => {
    await apiClient.deleteMockCard(assetId).catch(() => {});
    refreshList();
  };

  if (!signedIn) return <p className="muted">Sign in to add cards.</p>;
  const locked = !!mode && mode !== 'devnet';

  return (
    <div className="stack" style={{ maxWidth: 920 }}>
      <div className="row between">
        <h2>Add a Card</h2>
        {mode && <span className={`pill ${mode}`}><span className="dot" /> {mode}</span>}
      </div>

      {locked && (
        <div className="alert warn">
          Adding cards only works in <strong>devnet</strong> mode. <Link href="/settings">Switch to devnet →</Link>
        </div>
      )}

      <div className="panel pad-lg stack">
        <div>
          <h3 style={{ margin: '0 0 4px' }}>Search the real Pokémon TCG</h3>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Start typing a card name — only genuine cards from the official database can be added, with
            their real artwork. Grade &amp; vintage drive the derived battle level.
          </p>
        </div>

        <div className="tcg-search">
          <Icon name="search" size={18} className="tcg-search-ico" />
          <input
            className="input"
            placeholder="Charizard, Pikachu, Mewtwo…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPicked(null); }}
            disabled={locked}
            autoComplete="off"
          />
          {searching && <span className="spinner tcg-search-spin" />}

          {!picked && query.trim().length >= 2 && (
            <div className="tcg-results">
              {searching && results.length === 0 ? (
                <div className="tcg-empty">Searching the TCG database…</div>
              ) : results.length === 0 ? (
                <div className="tcg-empty">No real cards match “{query.trim()}”.</div>
              ) : (
                results.map((c) => (
                  <button key={c.id} className="tcg-result" onClick={() => setPicked(c)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.thumb} alt={c.name} loading="lazy" />
                    <span className="tcg-result-meta">
                      <strong>{c.name}</strong>
                      <span className="muted">
                        {[c.set, c.number && `#${c.number}`, c.rarity].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <Icon name="plus" size={16} className="muted-ico" />
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {picked && (
          <div className="tcg-pick">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="tcg-pick-img" src={picked.image} alt={picked.name} />
            <div className="stack" style={{ gap: 12, flex: 1 }}>
              <div>
                <strong style={{ fontSize: 18 }}>{picked.name}</strong>
                <div className="muted" style={{ fontSize: 13 }}>
                  {[picked.set, picked.number && `#${picked.number}`, picked.rarity, picked.year].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label>Grade (1–10)</label>
                  <input className="input" type="number" min={1} max={10} step={0.5} value={grade} onChange={(e) => setGrade(e.target.value)} />
                </div>
                <div className="field">
                  <label>Grading company</label>
                  <select className="select" value={grader} onChange={(e) => setGrader(e.target.value)}>
                    {GRADERS.map((g) => <option key={g} value={g}>{g || '— raw —'}</option>)}
                  </select>
                </div>
              </div>
              <div className="row">
                <button className="btn accent" onClick={() => void addPicked()} disabled={busy || locked}>
                  {busy ? 'Adding…' : 'Add to collection'}
                </button>
                <button className="btn ghost" onClick={() => setPicked(null)}>Pick another</button>
              </div>
            </div>
          </div>
        )}

        {err && <div className="alert danger">{err}</div>}

        {result && (result.playable ? (
          <div className="alert good row" style={{ alignItems: 'center', gap: 12 }}>
            {result.speciesId && spriteUrl(result.speciesId) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="sprite" src={spriteUrl(result.speciesId)} alt={result.speciesId} style={{ height: 56 }} />
            )}
            <span>
              Added <strong>{result.name}</strong> → <span style={{ textTransform: 'capitalize' }}>{result.speciesId}</span>
              {result.level != null && <> · Lv {result.level}</>}. <Link href="/team">Add to team →</Link>
            </span>
          </div>
        ) : (
          <div className="alert warn">
            “{result.name}” isn’t a recognizable Pokémon ({result.reason ?? 'no species match'}) — it was saved but won’t be playable.
          </div>
        ))}
      </div>

      <div className="panel stack">
        <div className="row between">
          <h3 style={{ margin: 0 }}>Your added cards</h3>
          <span className="badge">{list.length}</span>
        </div>
        {list.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>None yet — search above or buy from the <Link href="/market">devnet marketplace</Link>.</p>
        ) : (
          <div className="added-grid">
            {list.map((c) => (
              <div key={c.assetId} className="added-card">
                {c.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image} alt={c.name} loading="lazy" />
                ) : (
                  <div className="added-noimg">{c.name}</div>
                )}
                <div className="added-meta">
                  <strong title={c.name}>{c.name}</strong>
                  <button className="btn danger sm" onClick={() => void remove(c.assetId)}>
                    <Icon name="trash" size={14} /> Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
