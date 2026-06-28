'use client';

import Link from 'next/link';
import type { WagerTerms } from '@battler/core';
import type { CollectionCard } from '@battler/das';
import type { AssetsResponse } from '@/lib/api';
import { Icon } from '@/components/Icon';
import { PageHero } from '@/components/ui';
import { OpponentPicker } from '@/components/social/OpponentPicker';
import { iconSprite } from '@/lib/battle';
import { WagerChip, formatCryptoWager } from './shared';
import { WagerBanner } from './WagerBanner';

export interface NegoView {
  status: string;
  wager: WagerTerms;
  challengerAccepted: boolean;
  challengeeAccepted: boolean;
}

export function BattleLobby({
  pubkey,
  status,
  searching,
  onCancelSearch,
  oppKey,
  onOppKey,
  oppName,
  onOppName,
  wmode,
  onWmode,
  onFindWagerMatch,
  wkind,
  onWkind,
  wamount,
  onWamount,
  wcard,
  onWcard,
  playableCards,
  wagerReady,
  busy,
  onSendChallenge,
  nego,
  myAccepted,
  oppAccepted,
  incomingChallenge,
  onAccept,
  onCounter,
  onReject,
  assets,
}: {
  pubkey: string | null;
  status: string;
  searching: boolean;
  onCancelSearch: () => void;
  oppKey: string;
  onOppKey: (v: string) => void;
  oppName: string | null;
  onOppName: (v: string | null) => void;
  wmode: 'random' | 'specific';
  onWmode: (m: 'random' | 'specific') => void;
  onFindWagerMatch: () => void;
  wkind: 'crypto' | 'card';
  onWkind: (k: 'crypto' | 'card') => void;
  wamount: number;
  onWamount: (n: number) => void;
  wcard: string | null;
  onWcard: (id: string) => void;
  playableCards: CollectionCard[];
  wagerReady: boolean;
  busy: boolean;
  onSendChallenge: () => void;
  nego: NegoView | null;
  myAccepted: boolean;
  oppAccepted: boolean;
  incomingChallenge: boolean;
  onAccept: () => void;
  onCounter: () => void;
  onReject: () => void;
  assets: AssetsResponse | null;
}) {
  const short = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`;

  return (
    <div className="stack">
      <PageHero
        kicker="Battle arena"
        title="Arena"
        subtitle="Wager SOL or stake a card. Random matchmaking pairs equal stakes; challenges let you pick your opponent."
        stats={[{ value: '◎', label: 'SOL wagers' }]}
        actions={
          <span className="badge">
            {searching ? (
              <>
                <span className="spinner" style={{ marginRight: 6 }} />
                {status}
              </>
            ) : (
              status
            )}
          </span>
        }
      />

      <div className="lobby">
        <div className="game-panel pad-lg wallet-card stack">
          <div className="row between">
            <h3 style={{ margin: 0 }}>
              <Icon name="wallet" size={18} className="muted-ico" /> Your wallet
            </h3>
            <span className="muted" style={{ fontSize: 12 }}>{pubkey && short(pubkey)}</span>
          </div>
          <div className="bigcredits">◎ <span className="muted" style={{ fontSize: 16 }}>wager in SOL</span></div>
          <span className="muted" style={{ fontSize: 12, marginTop: -6 }}>
            On-chain SOL escrow — both stakes are held until the winner is paid (2.5% fee).
          </span>
          <div className="row">
            <Link href="/team" className="btn secondary">Edit team</Link>
          </div>
        </div>

        <div className="game-panel pad-lg stack">
          {incomingChallenge && nego && (
            <div className="callout accent" style={{ marginBottom: 4 }}>
              <strong>Incoming challenge!</strong>{' '}
              Stake on the line:{' '}
              <WagerChip w={nego.wager} assets={assets} onChain currency="SOL" />
              {' '}— review terms below.
            </div>
          )}

          <div className="segmented" role="tablist" aria-label="Wager mode">
            <button type="button" className={wmode === 'random' ? 'on' : ''} onClick={() => { onWmode('random'); if (wkind === 'card') onWkind('crypto'); }}>
              Random match
            </button>
            <button type="button" className={wmode === 'specific' ? 'on' : ''} onClick={() => onWmode('specific')}>
              Challenge a trainer
            </button>
          </div>

          {wmode === 'random' ? (
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Set your SOL stake — we&apos;ll pair you with a random trainer staking the same amount.
            </p>
          ) : (
            <>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                Challenge a specific trainer and negotiate stakes. Both must accept before the battle locks.
              </p>
              <OpponentPicker
                selectedPubkey={oppKey}
                selectedName={oppName}
                onSelect={(pk, name) => { onOppKey(pk); onOppName(name); }}
                onClear={() => { onOppKey(''); onOppName(null); }}
              />
            </>
          )}

          <div className="field">
            <label>Stake</label>
            <div className="wager-kinds wager-kinds-two">
              <button type="button" className={`wager-opt ${wkind === 'crypto' ? 'on' : ''}`} onClick={() => onWkind('crypto')}>
                <span className="coin" style={{ width: 22, height: 22 }} />
                SOL
              </button>
              {wmode === 'specific' && (
                <button type="button" className={`wager-opt ${wkind === 'card' ? 'on' : ''}`} onClick={() => onWkind('card')}>
                  <Icon name="cards" size={22} />
                  Stake card
                </button>
              )}
            </div>
            {wmode === 'random' && (
              <span className="muted" style={{ fontSize: 12 }}>Card stakes need a specific opponent — use “Challenge a trainer”.</span>
            )}
          </div>

          {wkind === 'crypto' && (
            <div className="field">
              <label htmlFor="amt">Amount (SOL)</label>
              <input
                id="amt"
                className="input"
                type="number"
                min={0.001}
                step={0.01}
                value={wamount}
                onChange={(e) => onWamount(Number(e.target.value))}
              />
              <span className="muted" style={{ fontSize: 12 }}>
                Both players stake {wamount} SOL to escrow before the battle. Winner takes the pot minus 2.5%.
              </span>
            </div>
          )}

          {wkind === 'card' && (
            <div className="field">
              <label>Pick a card to stake (you battle with it too)</label>
              {playableCards.length === 0 ? (
                <span className="muted" style={{ fontSize: 13 }}>
                  No playable cards — <Link href="/add-card">add one</Link>.
                </span>
              ) : (
                <div className="mini-cards">
                  {playableCards.map((c) => (
                    <button
                      key={c.assetId}
                      type="button"
                      className={`mini-card ${wcard === c.assetId ? 'on' : ''}`}
                      onClick={() => onWcard(c.assetId)}
                      title={c.cardName}
                    >
                      {iconSprite(c.speciesId!) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={iconSprite(c.speciesId!)} alt={c.speciesId!} style={{ imageRendering: 'pixelated' }} />
                      )}
                      <span>{c.speciesId}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {wmode === 'random' ? (
            searching ? (
              <div className="row">
                <button type="button" className="btn danger" onClick={onCancelSearch}>Cancel search</button>
                <span className="badge"><span className="spinner" style={{ marginRight: 6 }} />Searching for an equal staker…</span>
              </div>
            ) : (
              <button type="button" className="btn accent block glow" onClick={onFindWagerMatch} disabled={wamount <= 0}>
                <Icon name="sword" size={16} /> Find wager match
              </button>
            )
          ) : (
            !nego && (
              <button
                type="button"
                className="btn accent block"
                onClick={onSendChallenge}
                disabled={!wagerReady || busy}
              >
                {busy ? 'Sending…' : 'Send challenge'}
              </button>
            )
          )}

          {nego && (
            <div className="game-panel stack" style={{ gap: 12, background: 'var(--panel-2)' }}>
              <div className="row between">
                <strong>Negotiation</strong>
                <span className="badge accent">{nego.status}</span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span className="muted" style={{ fontSize: 13 }}>On the line:</span>
                <WagerChip w={nego.wager} assets={assets} onChain currency="SOL" />
              </div>
              {nego.wager.type === 'crypto' && (
                <span className="muted" style={{ fontSize: 12 }}>
                  Each player stakes {formatCryptoWager(nego.wager.amount ?? 0, true, 'SOL')} to escrow before the battle starts.
                </span>
              )}
              <div className="nego-accept">
                <span className="accept-side">
                  <span className={`accept-dot ${myAccepted ? 'yes' : ''}`} /> You {myAccepted ? 'accepted' : '—'}
                </span>
                <span className="accept-side">
                  <span className={`accept-dot ${oppAccepted ? 'yes' : ''}`} /> Opponent {oppAccepted ? 'accepted' : '—'}
                </span>
              </div>
              {nego.status !== 'REJECTED' && nego.status !== 'EXPIRED' && (
                <div className="row">
                  <button type="button" className="btn accent" onClick={onAccept} disabled={myAccepted}>
                    {myAccepted ? 'Accepted' : 'Accept terms'}
                  </button>
                  <button type="button" className="btn secondary" onClick={onCounter}>Counter with current stake</button>
                  <button type="button" className="btn ghost" onClick={onReject}>Reject</button>
                </div>
              )}
              <span className="muted" style={{ fontSize: 12 }}>
                Change the stake above, then <strong>Counter</strong> to send new terms. When both accept, the battle starts automatically.
              </span>
            </div>
          )}
        </div>
      </div>

      <WagerBanner />
    </div>
  );
}
