'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { Panel, Button } from '@/components/ui';

/** Claim/change a unique username linked to the wallet. Reused on Settings + Friends. */
export function UsernamePanel() {
  const [username, setUsername] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    apiClient
      .getProfile()
      .then((p) => { setUsername(p.username); setInput(p.username ?? ''); })
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const r = await apiClient.setUsername(input.trim());
      setUsername(r.username);
      setMsg({ ok: true, text: `You're now @${r.username}.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not set username.' });
    } finally {
      setSaving(false);
    }
  };

  const v = input.trim();
  return (
    <Panel variant="game" pad="lg" className="stack" style={{ maxWidth: 760 }}>
      <div>
        <h3 style={{ margin: '0 0 4px' }}>Trainer name</h3>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Pick a unique username linked to your wallet. Friends see this name, and trainers can
          challenge you by it — no wallet address needed.
        </p>
      </div>
      <div className="field">
        <label htmlFor="uname">Username</label>
        <div className="row" style={{ gap: 8 }}>
          <input
            id="uname"
            className="input"
            placeholder="e.g. ash_ketchum"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={20}
            style={{ maxWidth: 280 }}
          />
          <Button variant="accent" onClick={() => void save()} disabled={saving || v.length < 3 || v === username}>
            {saving ? 'Saving…' : username ? 'Update' : 'Claim'}
          </Button>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          3–20 characters, start with a letter, letters/numbers/_ only.{username ? ` Current: @${username}` : ''}
        </span>
      </div>
      {msg && <div className={`alert ${msg.ok ? 'good' : 'danger'}`}>{msg.text}</div>}
    </Panel>
  );
}
