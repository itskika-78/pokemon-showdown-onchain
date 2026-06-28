/**
 * Socket.IO event catalog (typed). Documented in EVENTS.md. The battle service
 * is authoritative: clients send only choices/intents, never game state.
 */

import type { WagerTerms, NegotiationStatus } from './match.js';

/** Validated choice grammar the server accepts (see battle-service). */
export type BattleChoice = string; // "move 1".."move 4" | "switch 1".."switch 6" | "pass" | "default"

// ---- client → server ----
export interface ClientToServerEvents {
  'queue:join': (p: { teamAssetIds: string[] }) => void;
  'queue:leave': () => void;
  /** Random WAGER matchmaking: queue with a stake; paired with a random equal staker. */
  'queue:joinWager': (p: { wager: WagerTerms }) => void;
  'queue:leaveWager': () => void;
  'battle:join': (p: { roomId: string }) => void;
  'battle:choice': (p: { roomId: string; choice: BattleChoice }) => void;
  'battle:reconnect': (p: { roomId: string }) => void;
  'negotiation:propose': (p: { challengeId: string; wager: WagerTerms }) => void;
  'negotiation:accept': (p: { challengeId: string }) => void;
  'negotiation:reject': (p: { challengeId: string }) => void;
  /** Client → server: a confirmed SOL stake deposit to escrow (on-chain wager). */
  'wager:deposit': (p: { roomId: string; signature: string }) => void;
}

// ---- server → client ----
export interface ServerToClientEvents {
  'queue:waiting': (p: { since: number }) => void;
  'battle:matched': (p: { roomId: string; opponent: string; wager: WagerTerms }) => void;
  /** Raw Showdown protocol lines for this player's side. */
  'battle:protocol': (p: { roomId: string; lines: string[] }) => void;
  'battle:request': (p: { roomId: string; request: unknown }) => void;
  'battle:turn': (p: { roomId: string; turn: number; deadline: number }) => void;
  'battle:end': (p: { roomId: string; winner: string | null; reason: string }) => void;
  'battle:error': (p: { roomId?: string; message: string }) => void;
  'negotiation:update': (p: {
    challengeId: string;
    challengerPubkey: string;
    challengeePubkey: string;
    status: NegotiationStatus;
    wager: WagerTerms;
    challengerAccepted: boolean;
    challengeeAccepted: boolean;
  }) => void;
  'negotiation:locked': (p: { challengeId: string; roomId: string; wager: WagerTerms; startsAt: number }) => void;
  /** Server → client: an on-chain wager needs each player to stake to escrow first. */
  'wager:awaiting-deposit': (p: { roomId: string; escrow: string; lamports: number; cluster: string }) => void;
  /** Server → client: deposit progress + battle start once both have staked. */
  'wager:deposit-update': (p: { roomId: string; youDeposited: boolean; bothDeposited: boolean; message?: string }) => void;
}

export interface SocketData {
  pubkey: string;
}
