'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import type { ClientToServerEvents, ServerToClientEvents, Negotiation, WagerTerms } from '@battler/core';
import { clientConfig } from '@/lib/clientConfig';
import { apiClient, getToken } from '@/lib/api';
import { useAppData } from '@/components/AppDataProvider';
import { useSession } from '@/components/Providers';
import { playCry } from '@/lib/cry';
import { playSfx } from '@/lib/sfx';
import { getPrefs } from '@/lib/prefs';
import { monSprite, iconSprite, speciesOfDetails } from '@/lib/battle';
import {
  interpret, emptyField, cloneField, type Field, type SideId,
} from '@/lib/battlePlayer';
import { BattleLobby } from '@/components/battle/BattleLobby';
import { BattleField } from '@/components/battle/BattleField';
import { MovePanel } from '@/components/battle/MovePanel';
import { short, WagerChip } from '@/components/battle/shared';
import { PageShell, EmptyState, Button } from '@/components/ui';
import { Icon } from '@/components/Icon';

type BattleSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
/* eslint-disable @typescript-eslint/no-explicit-any */ // sim request is dynamic JSON

interface NegoView { status: string; wager: WagerTerms; challengerAccepted: boolean; challengeeAccepted: boolean }

export default function BattlePage() {
  const { signedIn, pubkey } = useSession();
  const { connection } = useConnection();
  const wallet = useWallet();
  // Keep wallet/connection in refs so the persistent socket handlers (bound once
  // on sign-in) always see the live values without stale closures.
  const walletRef = useRef(wallet);
  walletRef.current = wallet;
  const connRef = useRef(connection);
  connRef.current = connection;

  // ---- battle playback ----
  const [field, setField] = useState<Field>(emptyField());
  const [msg, setMsg] = useState('');
  const [typing, setTyping] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [turnFlag, setTurnFlag] = useState<number | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [request, setRequest] = useState<any | null>(null);
  const [myId, setMyId] = useState<SideId>('p1');
  const [fx, setFx] = useState<{ p1?: string; p2?: string }>({});

  const [status, setStatus] = useState('Ready');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [searching, setSearching] = useState(false);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [showSwitch, setShowSwitch] = useState(false);
  const [ended, setEnded] = useState<{ winner: string | null; reason: string } | null>(null);
  const [oppName, setOppName] = useState<string | null>(null);

  // ---- lobby / wager ----
  const { assets } = useAppData();
  const [oppKey, setOppKey] = useState('');
  const [oppDisplayName, setOppDisplayName] = useState<string | null>(null);
  const [wmode, setWmode] = useState<'random' | 'specific'>('random');
  const [wkind, setWkind] = useState<'crypto' | 'card'>('crypto');
  const [wamount, setWamount] = useState(0.05);
  const [wcard, setWcard] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [nego, setNego] = useState<NegoView | null>(null);
  const [activeWager, setActiveWager] = useState<WagerTerms>({ type: 'crypto', amount: 50_000_000 });
  const [busy, setBusy] = useState(false);

  // Preselect an opponent passed from the Friends tab (/battle?opp=<addr>&name=<username>).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const opp = sp.get('opp');
    if (opp && opp.trim().length >= 32) {
      setOppKey(opp.trim());
      setOppDisplayName(sp.get('name'));
      setWmode('specific');
    }
  }, []);

  const socketRef = useRef<BattleSocket | null>(null);
  const challengeIdRef = useRef<string | null>(null);
  challengeIdRef.current = challengeId;
  const iAmChallenger = useRef(false);
  const logRef = useRef<HTMLDivElement | null>(null);
  const incoming = useRef<string[]>([]);
  const fieldRef = useRef<Field>(emptyField());
  const myIdRef = useRef<SideId>('p1');
  const pumping = useRef(false);
  const runId = useRef(0);
  const fxTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const refreshBalance = useCallback(() => {
    window.dispatchEvent(new Event('balance-refresh'));
  }, []);

  const applyNegotiation = useCallback((n: Negotiation, myPubkey: string) => {
    iAmChallenger.current = n.challengerPubkey === myPubkey;
    setChallengeId(n.challengeId);
    setNego({
      status: n.status,
      wager: n.wager,
      challengerAccepted: n.challengerAccepted,
      challengeeAccepted: n.challengeeAccepted,
    });
    if (n.challengeePubkey === myPubkey) setOppKey(n.challengerPubkey);
    if (n.wager.type === 'crypto') {
      setWkind('crypto');
      setWamount((n.wager.amount ?? 0) / 1_000_000_000);
    } else if (n.wager.type === 'card' && n.wager.assetId) {
      setWkind('card');
      setWcard(n.wager.assetId);
    }
  }, []);

  const pollPendingChallenges = useCallback(async (myPubkey: string) => {
    try {
      const { challenges: list } = await apiClient.pendingChallenges();
      const active = list[0];
      if (!active) return;
      const isNew = challengeIdRef.current !== active.challengeId;
      applyNegotiation(active, myPubkey);
      if (isNew) {
        setStatus(iAmChallenger.current ? 'Challenge sent — waiting for the opponent…' : 'Incoming challenge — review terms below');
      }
    } catch {
      /* battle page works without poll */
    }
  }, [applyNegotiation]);

  const triggerFx = useCallback((side: SideId, kind: string) => {
    setFx((f) => ({ ...f, [side]: kind }));
    clearTimeout(fxTimers.current[side]);
    fxTimers.current[side] = setTimeout(() => setFx((f) => ({ ...f, [side]: undefined })), kind === 'hit' ? 430 : 380);
  }, []);

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const typeText = useCallback((text: string, myRun: number) => new Promise<void>((resolve) => {
    setLogLines((l) => [...l.slice(-50), text]);
    let i = 0;
    setTyping(true);
    setMsg('');
    const step = () => {
      if (myRun !== runId.current) { setTyping(false); resolve(); return; }
      i++;
      setMsg(text.slice(0, i));
      if (i >= text.length) {
        setTyping(false);
        setTimeout(resolve, Math.min(1100, 360 + text.length * 15));
      } else {
        setTimeout(step, 22);
      }
    };
    step();
  }), []);

  const pump = useCallback(async () => {
    if (pumping.current) return;
    pumping.current = true;
    setAnimating(true);
    const myRun = runId.current;
    // Battle text speed preference scales every pause (slow ↔ fast).
    const speed = getPrefs().battleSpeed;
    const factor = speed === 'fast' ? 0.55 : speed === 'slow' ? 1.4 : 1;
    while (incoming.current.length && myRun === runId.current) {
      const line = incoming.current.shift()!;
      const ev = interpret(line, fieldRef.current, myIdRef.current);
      setField(cloneField(fieldRef.current));
      if (ev.turn != null) { setTurnFlag(ev.turn); setTimeout(() => setTurnFlag(null), 1400); }
      if (ev.fx) triggerFx(ev.fx.side, ev.fx.kind);
      if (ev.sfx) playSfx(ev.sfx);
      if (ev.cry) playCry(ev.cry, 0.4);
      if (ev.text) await typeText(ev.text, myRun);
      if (ev.delay) await sleep(ev.delay * factor);
    }
    pumping.current = false;
    if (myRun === runId.current && incoming.current.length === 0) setAnimating(false);
  }, [triggerFx, typeText]);

  const resetBattleState = useCallback(() => {
    runId.current++;
    incoming.current = [];
    pumping.current = false;
    fieldRef.current = emptyField();
    setField(emptyField());
    setMsg(''); setTyping(false); setAnimating(false);
    setLogLines([]); setTurnFlag(null);
    setRequest(null); setEnded(null); setShowSwitch(false); setFx({});
  }, []);

  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [logLines.length]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  useEffect(() => { setWamount(0.05); }, []);

  /** On-chain wager: stake `lamports` SOL to the escrow wallet, then notify the server. */
  const depositToEscrow = useCallback(async (rid: string, escrow: string, lamports: number) => {
    const w = walletRef.current;
    const conn = connRef.current;
    if (!w.publicKey || !w.sendTransaction) { setStatus('Connect your wallet to stake.'); return; }
    try {
      setStatus(`Staking ${(lamports / 1e9).toFixed(3)} SOL — approve in your wallet…`);
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
      const tx = new Transaction({ feePayer: w.publicKey, blockhash, lastValidBlockHeight }).add(
        SystemProgram.transfer({ fromPubkey: w.publicKey, toPubkey: new PublicKey(escrow), lamports }),
      );
      const sig = await w.sendTransaction(tx, conn);
      await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      socketRef.current?.emit('wager:deposit', { roomId: rid, signature: sig });
      setStatus('Stake confirmed — waiting for your opponent…');
    } catch (e) {
      const m = e instanceof Error ? e.message : 'error';
      setStatus(/user rejected|rejected the request/i.test(m) ? 'You declined the stake — wager cancelled.' : 'Stake failed: ' + m);
    }
  }, []);

  // Persistent socket: connect on sign-in so the lobby can receive challenges + matches.
  useEffect(() => {
    if (!signedIn) return;
    const token = getToken();
    if (!token) return;
    const socket: BattleSocket = io(clientConfig.wsUrl, { auth: { token }, transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      if (pubkey) void pollPendingChallenges(pubkey);
    });

    socket.on('connect_error', (e) => setStatus('Connection failed: ' + e.message));
    socket.on('queue:waiting', () => setStatus('Searching for an opponent…'));
    socket.on('battle:matched', (p) => {
      setSearching(false);
      setActiveWager(p.wager);
      setOppName(p.opponent);
      setRoomId(p.roomId);
      resetBattleState();
      setStatus(`Matched vs ${short(p.opponent)}`);
      socket.emit('battle:join', { roomId: p.roomId });
      setPlaying(true);
    });
    socket.on('battle:protocol', (p) => { incoming.current.push(...p.lines); void pump(); });
    socket.on('battle:request', (p) => {
      const req = p.request as any;
      if (req?.side?.id === 'p1' || req?.side?.id === 'p2') { setMyId(req.side.id); myIdRef.current = req.side.id; }
      setRequest(req);
      setShowSwitch(false);
    });
    socket.on('battle:turn', (p) => { setStatus(`Turn ${p.turn}`); setDeadline(p.deadline); });
    socket.on('battle:end', (p) => {
      setEnded({ winner: p.winner, reason: p.reason });
      setRequest(null); setDeadline(null); setPlaying(false);
      setStatus(p.winner ? `Winner: ${short(p.winner)}` : `Battle ended (${p.reason})`);
      refreshBalance();
    });
    socket.on('battle:error', (p) => { setStatus(p.message); setSearching(false); });

    socket.on('negotiation:update', (p) => {
      if (pubkey) {
        iAmChallenger.current = p.challengerPubkey === pubkey;
        if (p.challengeePubkey === pubkey) setOppKey(p.challengerPubkey);
      }
      setChallengeId(p.challengeId);
      setNego({
        status: p.status,
        wager: p.wager,
        challengerAccepted: p.challengerAccepted,
        challengeeAccepted: p.challengeeAccepted,
      });
      if (p.wager.type === 'crypto') {
        setWkind('crypto');
        setWamount((p.wager.amount ?? 0) / 1_000_000_000);
      }
      if (p.status === 'REJECTED' || p.status === 'EXPIRED') {
        setStatus(`Negotiation ${p.status.toLowerCase()}`);
        setTimeout(() => { setNego(null); setChallengeId(null); }, 1800);
      } else {
        setStatus(iAmChallenger.current ? 'Challenge sent — waiting for the opponent…' : 'Incoming challenge — review terms below');
      }
    });
    socket.on('negotiation:locked', (p) => {
      setSearching(false);
      setActiveWager(p.wager);
      setRoomId(p.roomId);
      setNego(null); setChallengeId(null);
      resetBattleState();
      setStatus('Terms locked — battle starting…');
      socket.emit('battle:join', { roomId: p.roomId });
      setPlaying(true);
    });
    // On-chain wager: each player must stake to escrow before the battle starts.
    socket.on('wager:awaiting-deposit', (p) => {
      setSearching(false);
      setNego(null); setChallengeId(null);
      void depositToEscrow(p.roomId, p.escrow, p.lamports);
    });
    socket.on('wager:deposit-update', (p) => {
      if (p.message) setStatus('Stake not accepted: ' + p.message);
      else if (p.bothDeposited) setStatus('Both staked — battle starting…');
      else if (p.youDeposited) setStatus('Stake confirmed — waiting for your opponent…');
    });

    return () => { socket.disconnect(); socketRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, pubkey, pollPendingChallenges]);

  // Poll for challenges missed while the socket was down or the tab was closed.
  useEffect(() => {
    if (!signedIn || !pubkey || playing) return;
    const id = setInterval(() => { void pollPendingChallenges(pubkey); }, 5000);
    return () => clearInterval(id);
  }, [signedIn, pubkey, playing, pollPendingChallenges]);

  async function findWagerMatch() {
    const socket = socketRef.current;
    if (!socket) { setStatus('Reconnecting…'); return; }
    const team = await apiClient.getTeam();
    if (team.assetIds.length === 0) { setStatus('Build a team first (Team tab)'); return; }
    const wager = buildWager();
    if (!wager) { setStatus('Set a valid SOL stake first.'); return; }
    if (wager.type === 'card') { setStatus('Card stakes need a specific opponent — switch to “Challenge a trainer”.'); return; }
    resetBattleState();
    setActiveWager(wager);
    setSearching(true);
    setStatus('Searching for a trainer staking the same…');
    socket.emit('queue:joinWager', { wager });
  }

  function cancelSearch() {
    socketRef.current?.emit('queue:leaveWager');
    setSearching(false);
    setStatus('Ready');
  }

  function buildWager(): WagerTerms | null {
    if (wkind === 'crypto') {
      if (wamount <= 0) return null;
      return { type: 'crypto', amount: Math.round(wamount * 1_000_000_000) };
    }
    if (wkind === 'card' && wcard) return { type: 'card', assetId: wcard };
    return null;
  }

  const wagerReady =
    oppKey.trim().length >= 32 && oppKey.trim() !== pubkey &&
    (wkind === 'card' ? !!wcard : wamount > 0);

  async function sendChallenge() {
    const socket = socketRef.current;
    if (!socket || !wagerReady) return;
    setBusy(true);
    setStatus('Opening challenge…');
    try {
      const wager = buildWager();
      if (!wager) { setStatus('Set a valid stake first.'); return; }
      const { challengeId: id } = await apiClient.challenge(oppKey.trim(), wager);
      iAmChallenger.current = true;
      setChallengeId(id);
      setNego({ status: 'PENDING', wager, challengerAccepted: false, challengeeAccepted: false });
      socket.emit('negotiation:propose', { challengeId: id, wager });
      setStatus('Challenge sent — waiting for the opponent…');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Challenge failed');
    } finally {
      setBusy(false);
    }
  }

  function counterOffer() {
    if (!socketRef.current || !challengeId) return;
    const wager = buildWager();
    if (!wager) { setStatus('Set a valid stake first.'); return; }
    socketRef.current.emit('negotiation:propose', { challengeId, wager });
    setStatus('Counter-offer sent…');
  }
  function acceptTerms() {
    if (!socketRef.current || !challengeId) return;
    socketRef.current.emit('negotiation:accept', { challengeId });
    setStatus('Accepted — waiting for the opponent…');
  }
  function rejectTerms() {
    if (!socketRef.current || !challengeId) return;
    socketRef.current.emit('negotiation:reject', { challengeId });
    setNego(null); setChallengeId(null); setStatus('Ready');
  }

  function leaveBattle() {
    runId.current++;
    setPlaying(false); setEnded(null); setRoomId(null);
    resetBattleState();
    setStatus('Ready'); setActiveWager({ type: 'crypto', amount: Math.round(wamount * 1_000_000_000) }); setOppName(null);
  }

  function choose(choice: string) {
    if (socketRef.current && roomId) {
      socketRef.current.emit('battle:choice', { roomId, choice });
      setRequest(null); setDeadline(null); setShowSwitch(false);
      setStatus('Waiting for opponent…');
    }
  }

  function chooseLead(leadIdx: number, teamSize: number) {
    const order = [leadIdx, ...Array.from({ length: teamSize }, (_, k) => k).filter((k) => k !== leadIdx)];
    choose(`team ${order.map((i) => i + 1).join('')}`);
  }

  if (!signedIn) {
    return (
      <PageShell stickers={3}>
        <EmptyState
          title="Enter the arena"
          description="Sign in and build a team to wager in the arena."
          actions={<Button href="/login" variant="accent" glow>Sign in</Button>}
        />
      </PageShell>
    );
  }

  const active = request?.active?.[0];
  const moves: any[] = active?.moves ?? [];
  const forceSwitch: boolean = Array.isArray(request?.forceSwitch) && request.forceSwitch.some(Boolean);
  const waiting: boolean = !!request?.wait;
  const bench: any[] = request?.side?.pokemon ?? [];
  const oppId: SideId = myId === 'p1' ? 'p2' : 'p1';
  const myActive = field.active[myId];
  const oppActive = field.active[oppId];
  const trapped = !!active?.trapped || active?.maybeTrapped;
  const secs = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
  const faintedMine = new Set(bench.filter((p) => p?.condition?.includes('fnt')).map((p) => speciesOfDetails(p.details)));
  const playableCards = (assets?.cards ?? []).filter((c) => c.playable && c.speciesId);
  const controlsReady = !animating && !!request && !ended;

  const myAccepted = nego ? (iAmChallenger.current ? nego.challengerAccepted : nego.challengeeAccepted) : false;
  const oppAccepted = nego ? (iAmChallenger.current ? nego.challengeeAccepted : nego.challengerAccepted) : false;
  const incomingChallenge = !!nego && !iAmChallenger.current;

  // ---------- LOBBY ----------
  if (!playing && !ended) {
    return (
      <PageShell stickers={5} interactiveStickers>
        <BattleLobby
          pubkey={pubkey}
          status={status}
          searching={searching}
          onCancelSearch={cancelSearch}
          oppKey={oppKey}
          onOppKey={setOppKey}
          oppName={oppDisplayName}
          onOppName={setOppDisplayName}
          wmode={wmode}
          onWmode={setWmode}
          onFindWagerMatch={() => void findWagerMatch()}
          wkind={wkind}
          onWkind={setWkind}
          wamount={wamount}
          onWamount={setWamount}
          wcard={wcard}
          onWcard={setWcard}
          playableCards={playableCards}
          wagerReady={wagerReady}
          busy={busy}
          onSendChallenge={() => void sendChallenge()}
          nego={nego}
          myAccepted={myAccepted}
          oppAccepted={oppAccepted}
          incomingChallenge={incomingChallenge}
          onAccept={acceptTerms}
          onCounter={counterOffer}
          onReject={rejectTerms}
          assets={assets}
        />
      </PageShell>
    );
  }

  // ---------- BATTLE ----------
  return (
    <PageShell stickers={3}>
    <div className="stack">
      <div className="row between">
        <div className="row">
          <h2>Battle</h2>
          {activeWager.type !== 'none' && (
            <WagerChip w={activeWager} assets={assets} onChain currency="SOL" />
          )}
          {oppName && !ended && <span className="badge">vs {short(oppName)}</span>}
          {field.turn > 0 && !ended && <span className="badge accent">Turn {field.turn}</span>}
          {secs != null && !ended && <span className="badge" style={secs <= 10 ? { color: 'var(--danger)', borderColor: 'var(--danger)' } : undefined}><Icon name="clock" size={13} /> {secs}s</span>}
        </div>
        {ended && !animating && <button className="btn accent" onClick={leaveBattle}>Back to arena</button>}
      </div>

      {request?.teamPreview && !ended ? (() => {
        const myTeam: any[] = request?.side?.pokemon ?? [];
        const teamSize = myTeam.length;
        const oppTeam = field.preview[oppId];
        return (
          <div className="panel pad-lg stack">
            <div className="row between">
              <h3 style={{ margin: 0 }}>Team Preview</h3>
              <span className="badge accent">Choose your lead</span>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>Click a Pokémon to send it out first — the rest follow in order.</p>
            <div className="tp-section">
              <div className="tp-label">Your team</div>
              <div className="tp-row">
                {myTeam.map((p, i) => {
                  const sp = speciesOfDetails(p.details);
                  const lvl = String(p.details ?? '').match(/L(\d+)/)?.[1];
                  return (
                    <button key={i} className="tp-mon click" onClick={() => chooseLead(i, teamSize)} title="Lead with this Pokémon"
                      onMouseEnter={() => playCry(sp.toLowerCase().replace(/[^a-z0-9]/g, ''))}>
                      {monSprite(sp, false) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={monSprite(sp, false)} alt={sp} />
                      )}
                      <strong style={{ textTransform: 'capitalize' }}>{sp}</strong>
                      {lvl && <span className="muted" style={{ fontSize: 11 }}>Lv {lvl}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="tp-section">
              <div className="tp-label">Opponent</div>
              <div className="tp-row">
                {oppTeam.length === 0 ? <span className="muted">Revealing…</span> : oppTeam.map((m, i) => (
                  <div key={i} className="tp-mon">
                    {monSprite(m.species, false) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={monSprite(m.species, false)} alt={m.species} />
                    )}
                    <strong style={{ textTransform: 'capitalize' }}>{m.species}</strong>
                    <span className="muted" style={{ fontSize: 11 }}>Lv {m.level}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="row">
              <button className="btn accent" onClick={() => choose('default')}>Lead with default order</button>
            </div>
          </div>
        );
      })() : (
        <div className="battle-wrap">
          <BattleField
            field={field}
            myId={myId}
            oppId={oppId}
            fx={fx}
            msg={msg}
            typing={typing}
            animating={animating}
            ended={ended}
            turnFlag={turnFlag}
            mineRevealed={bench.map((p) => speciesOfDetails(p.details))}
            mineFainted={faintedMine}
          />

          {/* controls + log */}
          <div className="battle-side">
            {ended && !animating ? (
              (() => {
                const iWon = !!ended.winner && ended.winner === field.names[myId];
                const tie = ended.winner === null;
                return (
                  <div className={`result-banner ${tie ? 'tie' : iWon ? 'win' : 'lose'}`}>
                    {tie ? 'Draw' : iWon ? 'Victory!' : 'Defeat'}
                    {!tie && activeWager.type !== 'none' && (
                      <div style={{ fontSize: 14, marginTop: 8, fontWeight: 600 }}>
                        {activeWager.type === 'crypto'
                          ? (iWon ? `You won ${(activeWager.amount ?? 0).toLocaleString()} credits (minus fee)` : `You lost ${(activeWager.amount ?? 0).toLocaleString()} credits`)
                          : (iWon ? 'You won the staked card.' : 'Your staked card transfers to the winner.')}
                      </div>
                    )}
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      {ended.winner && !iWon && `Winner: ${short(ended.winner)} · `}reason: {ended.reason}
                    </div>
                  </div>
                );
              })()
            ) : !controlsReady ? (
              <div className="panel"><span className="spinner" style={{ marginRight: 8 }} />{animating ? 'The action plays out…' : status}</div>
            ) : waiting ? (
              <div className="panel"><span className="spinner" /> Waiting for opponent…</div>
            ) : forceSwitch || showSwitch ? (
              <div className="panel stack" style={{ gap: 10 }}>
                <div className="row between">
                  <strong>{forceSwitch ? 'Choose your next Pokémon' : 'Switch to'}</strong>
                  {!forceSwitch && <button className="btn ghost sm" onClick={() => setShowSwitch(false)}>Back</button>}
                </div>
                <div className="switch-grid">
                  {bench.map((p, i) => {
                    const sp = speciesOfDetails(p.details);
                    const fnt = p?.condition?.includes('fnt');
                    const isActive = p?.active;
                    return (
                      <button key={i} className="switch-btn" disabled={fnt || isActive} onClick={() => choose(`switch ${i + 1}`)}
                        onMouseEnter={() => playCry(sp.toLowerCase().replace(/[^a-z0-9]/g, ''))}>
                        {iconSprite(sp) && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={iconSprite(sp)} alt={sp} style={{ height: 40, imageRendering: 'pixelated' }} />
                        )}
                        <span style={{ textTransform: 'capitalize', fontSize: 13 }}>{sp}</span>
                        <span className="muted" style={{ fontSize: 11 }}>{fnt ? 'fainted' : isActive ? 'active' : (p?.condition ?? '')}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : active ? (
              <MovePanel
                species={myActive?.species}
                moves={moves}
                trapped={!!trapped}
                onMove={(i) => choose(`move ${i + 1}`)}
                onSwitch={() => setShowSwitch(true)}
              />
            ) : (
              <div className="panel"><span className="spinner" /> {status}</div>
            )}

            <div className="panel" style={{ padding: 10 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Battle log</div>
              <div className="log" ref={logRef} style={{ height: 240 }}>
                {logLines.length === 0 ? <span className="muted">The battle will narrate here…</span> : logLines.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </PageShell>
  );
}
