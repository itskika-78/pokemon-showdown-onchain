'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/components/Providers';
import { useAppData } from '@/components/AppDataProvider';
import { apiClient, type DasNetwork } from '@/lib/api';
import { PageShell, PageHero, Panel, Button, Pill } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { UsernamePanel } from '@/components/social/UsernamePanel';
import { getPrefs, setPref, DEFAULT_PREFS, type Prefs } from '@/lib/prefs';

const NETWORKS: { id: DasNetwork; label: string; blurb: string }[] = [
  { id: 'devnet', label: 'Devnet', blurb: 'Test with devnet SOL — buy trending cards from the limited-stock marketplace, or add cards manually.' },
  { id: 'mainnet', label: 'Mainnet', blurb: 'Your real Phygitals cNFTs from Solana mainnet-beta. Buy new cards on Magic Eden or Phygitals.' },
];

export default function SettingsPage() {
  const { signedIn } = useSession();
  const { settings, refreshSettings } = useAppData();
  const [mode, setMode] = useState<DasNetwork>(() => settings?.mode ?? 'devnet');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [probe, setProbe] = useState<{ ok: boolean; latencyMs: number; sampleAssets?: number; error?: string } | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  useEffect(() => setPrefs(getPrefs()), []);
  const togglePref = <K extends keyof Prefs>(key: K, value: Prefs[K]) => setPrefs(setPref(key, value));

  useEffect(() => {
    if (settings) setMode(settings.mode);
  }, [settings]);

  useEffect(() => {
    if (signedIn) void refreshSettings();
  }, [signedIn, refreshSettings]);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    setErr(null);
    try {
      const s = await apiClient.setSettings({ mode });
      setMode(s.mode);
      void refreshSettings();
      setStatus(`Saved — now on ${s.mode}.`);
      window.dispatchEvent(new Event('das-settings-changed'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setProbe(null);
    setErr(null);
    try {
      const r = await apiClient.testSettings({ mode });
      setProbe(r);
    } catch (e) {
      setProbe({ ok: false, latencyMs: 0, error: e instanceof Error ? e.message : 'Probe failed' });
    } finally {
      setTesting(false);
    }
  };

  if (!signedIn) {
    return (
      <PageShell stickers={2}>
        <p className="muted">Sign in to manage settings.</p>
      </PageShell>
    );
  }

  if (!settings) {
    return (
      <PageShell stickers={2}>
        <PageHero kicker="Configuration" title="Settings" subtitle="Loading…" />
        <Panel className="stack skeleton" style={{ minHeight: 200 }} aria-hidden />
      </PageShell>
    );
  }

  const dirty = mode !== settings.mode;
  const activeRpcOk = mode === 'mainnet' ? settings.rpcConfigured.mainnet : settings.rpcConfigured.devnet;

  return (
    <PageShell stickers={3}>
      <PageHero
        kicker="Configuration"
        title="Settings"
        subtitle="Switch between devnet and mainnet. Helius API credentials are configured securely on the server — they cannot be viewed or changed here."
        actions={<Pill mode={settings.mode}>{settings.mode}</Pill>}
      />

      <UsernamePanel />

      <Panel variant="game" pad="lg" className="stack" style={{ maxWidth: 760, marginTop: 18 }}>
        <div>
          <h3 style={{ margin: '0 0 4px' }}>Network</h3>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            cNFTs are only readable through the DAS API. Switching takes effect immediately.
          </p>
        </div>

        <div className="alert info" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="shield" size={16} />
          <span>
            Helius RPC endpoints are <strong>server-side only</strong> (via <code>HELIUS_API_KEY</code> env var).
            {' '}Mainnet: {settings.rpcConfigured.mainnet ? 'configured' : 'missing'} · Devnet: {settings.rpcConfigured.devnet ? 'configured' : 'missing'}
          </span>
        </div>

        <div className="net-grid" role="tablist" aria-label="Network">
          {NETWORKS.map((n) => (
            <button
              key={n.id}
              type="button"
              role="tab"
              aria-selected={mode === n.id}
              className={`net-card ${n.id} ${mode === n.id ? 'on' : ''}`}
              onClick={() => setMode(n.id)}
              disabled={!settings.canEditMode}
            >
              <span className="net-card-head">
                <span className={`dot ${n.id}`} />
                {n.label}
                <span className="net-chip">on-chain</span>
              </span>
              <span className="net-card-blurb">{n.blurb}</span>
            </button>
          ))}
        </div>

        {!activeRpcOk && (
          <div className="alert warn">
            Server missing Helius config for <strong>{mode}</strong>. Set <code>HELIUS_API_KEY</code> in your hosting environment.
          </div>
        )}

        {!settings.canEditMode && (
          <div className="alert warn">
            Network mode is locked in production (defaults to mainnet via server config).
          </div>
        )}

        <div className="field">
          <label>Connection</label>
          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
            <Button variant="secondary" size="sm" onClick={() => void testConnection()} disabled={testing || !activeRpcOk}>
              {testing ? 'Testing…' : 'Test server connection'}
            </Button>
            {probe && (
              <span className={`probe-result ${probe.ok ? 'ok' : 'bad'}`}>
                <Icon name={probe.ok ? 'shield' : 'close'} size={14} />
                {probe.ok ? (
                  <>Reachable · {probe.latencyMs}ms{typeof probe.sampleAssets === 'number' ? ` · ${probe.sampleAssets} asset(s)` : ''}</>
                ) : (
                  <>{probe.error ?? 'Unreachable'}</>
                )}
              </span>
            )}
          </div>
        </div>

        {mode === 'devnet' && (
          <div className="alert info">
            Devnet marketplace uses limited stock — buy trending cards with devnet SOL, or{' '}
            <Link href="/add-card">add cards manually</Link>.
          </div>
        )}

        {mode === 'mainnet' && (
          <div className="alert warn">
            Mainnet shows cards you already own. To buy new cards, visit{' '}
            <a href="https://magiceden.io/marketplace/phygitals" target="_blank" rel="noopener noreferrer">Magic Eden</a>
            {' '}or{' '}
            <a href="https://phygitals.com/marketplace" target="_blank" rel="noopener noreferrer">Phygitals</a>.
          </div>
        )}

        <div className="field">
          <label>Supported collections</label>
          {settings.supportedCollections.length ? (
            <div className="row" style={{ gap: 8 }}>
              {settings.supportedCollections.map((c) => (
                <code key={c} className="addr-chip" title={c}>{c.slice(0, 6)}…{c.slice(-4)}</code>
              ))}
            </div>
          ) : (
            <span className="muted" style={{ fontSize: 13 }}>
              Set <code>PHYGITALS_COLLECTION_MINTS</code> on the server to lock the allow-list.
            </span>
          )}
        </div>

        {status && <div className="alert good">{status} <Link href="/collection">Open collection →</Link></div>}
        {err && <div className="alert danger">{err}</div>}

        <div className="row">
          <Button variant="accent" onClick={() => void save()} disabled={!settings.canEditMode || saving || !dirty || !activeRpcOk}>
            {saving ? 'Saving…' : 'Save network'}
          </Button>
          {!settings.canEditMode && <span className="muted" style={{ fontSize: 13 }}>Locked in production.</span>}
          <span className="spacer" />
          <span className="muted" style={{ fontSize: 12 }}>cluster: {settings.cluster}</span>
        </div>
      </Panel>

      <Panel variant="game" pad="lg" className="stack" style={{ maxWidth: 760, marginTop: 18 }}>
        <div>
          <h3 style={{ margin: '0 0 4px' }}>Preferences</h3>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>Saved on this device only.</p>
        </div>
        <div className="prefs-grid">
          <label className="pref-row">
            <span>Sound effects</span>
            <input type="checkbox" checked={!prefs.muteSound} onChange={(e) => togglePref('muteSound', !e.target.checked)} />
          </label>
          <label className="pref-row">
            <span>Pokémon cries on hover</span>
            <input type="checkbox" checked={prefs.cardCries} onChange={(e) => togglePref('cardCries', e.target.checked)} />
          </label>
          <label className="pref-row">
            <span>Reduce motion</span>
            <input type="checkbox" checked={prefs.reduceMotion} onChange={(e) => togglePref('reduceMotion', e.target.checked)} />
          </label>
          <label className="pref-row">
            <span>Animated sprites</span>
            <input type="checkbox" checked={prefs.showSprites} onChange={(e) => togglePref('showSprites', e.target.checked)} />
          </label>
          <label className="pref-row">
            <span>Compact cards</span>
            <input type="checkbox" checked={prefs.compactCards} onChange={(e) => togglePref('compactCards', e.target.checked)} />
          </label>
          <label className="pref-row">
            <span>Battle text speed</span>
            <select className="select" value={prefs.battleSpeed} onChange={(e) => togglePref('battleSpeed', e.target.value as Prefs['battleSpeed'])}>
              <option value="slow">Slow</option>
              <option value="normal">Normal</option>
              <option value="fast">Fast</option>
            </select>
          </label>
        </div>
      </Panel>
    </PageShell>
  );
}
