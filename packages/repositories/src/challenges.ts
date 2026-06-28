import type { Negotiation, NegotiationStatus, WagerTerms } from '@battler/core';
import { query } from '@battler/server-kit';

interface ChallengeDbRow {
  challenge_id: string;
  challenger_pubkey: string;
  challengee_pubkey: string;
  wager_type: WagerTerms['type'];
  wager_amount: string | null;
  wager_asset_id: string | null;
  proposed_by: string;
  status: NegotiationStatus;
  challenger_accepted: boolean;
  challengee_accepted: boolean;
  expires_at: string;
  created_at: string;
}

function map(r: ChallengeDbRow): Negotiation {
  return {
    challengeId: r.challenge_id,
    challengerPubkey: r.challenger_pubkey,
    challengeePubkey: r.challengee_pubkey,
    wager: {
      type: r.wager_type,
      amount: r.wager_amount == null ? undefined : Number(r.wager_amount),
      assetId: r.wager_asset_id ?? undefined,
    },
    proposedBy: r.proposed_by,
    status: r.status,
    challengerAccepted: r.challenger_accepted,
    challengeeAccepted: r.challengee_accepted,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  };
}

export async function createChallenge(input: {
  challenger: string;
  challengee: string;
  wager: WagerTerms;
  ttlSeconds: number;
}): Promise<Negotiation> {
  const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000).toISOString();
  const res = await query<ChallengeDbRow>(
    `INSERT INTO challenges
       (challenger_pubkey, challengee_pubkey, wager_type, wager_amount, wager_asset_id, proposed_by, expires_at)
     VALUES ($1,$2,$3,$4,$5,$1,$6) RETURNING *`,
    [
      input.challenger,
      input.challengee,
      input.wager.type,
      input.wager.amount ?? null,
      input.wager.assetId ?? null,
      expiresAt,
    ],
  );
  return map(res.rows[0]!);
}

export async function getChallenge(id: string): Promise<Negotiation | null> {
  const res = await query<ChallengeDbRow>('SELECT * FROM challenges WHERE challenge_id = $1', [id]);
  return res.rows[0] ? map(res.rows[0]) : null;
}

/**
 * Counter-offer: replace terms, reset both acceptances, set COUNTERED. The
 * caller (`proposedBy`) MUST be a participant — the WHERE clause enforces it so
 * a stranger who knows a challenge id can't alter someone else's wager terms.
 */
export async function counterChallenge(id: string, wager: WagerTerms, proposedBy: string): Promise<Negotiation | null> {
  const res = await query<ChallengeDbRow>(
    `UPDATE challenges SET wager_type=$2, wager_amount=$3, wager_asset_id=$4, proposed_by=$5,
       status='COUNTERED', challenger_accepted=FALSE, challengee_accepted=FALSE
     WHERE challenge_id=$1 AND status IN ('PENDING','COUNTERED')
       AND (challenger_pubkey=$5 OR challengee_pubkey=$5) RETURNING *`,
    [id, wager.type, wager.amount ?? null, wager.assetId ?? null, proposedBy],
  );
  return res.rows[0] ? map(res.rows[0]) : null;
}

/**
 * Record one side's acceptance; flips status to ACCEPTED when both agree.
 * Rejects callers that are NOT a participant (otherwise a third party could
 * accept on the challengee's behalf and force a wagered match to start).
 */
export async function acceptChallenge(id: string, pubkey: string): Promise<Negotiation | null> {
  const current = await getChallenge(id);
  if (!current) return null;
  const isChallenger = current.challengerPubkey === pubkey;
  const isChallengee = current.challengeePubkey === pubkey;
  if (!isChallenger && !isChallengee) return null; // not a participant — refuse
  const col = isChallenger ? 'challenger_accepted' : 'challengee_accepted';
  const res = await query<ChallengeDbRow>(
    `UPDATE challenges SET ${col} = TRUE,
       status = CASE WHEN ${isChallenger ? 'challengee_accepted' : 'challenger_accepted'} THEN 'ACCEPTED' ELSE status END
     WHERE challenge_id = $1 AND status IN ('PENDING','COUNTERED') RETURNING *`,
    [id],
  );
  return res.rows[0] ? map(res.rows[0]) : null;
}

/** Reject a challenge — only a participant may, and only while still open. */
export async function rejectChallenge(id: string, pubkey: string): Promise<Negotiation | null> {
  const res = await query<ChallengeDbRow>(
    `UPDATE challenges SET status='REJECTED'
     WHERE challenge_id=$1 AND status IN ('PENDING','COUNTERED')
       AND (challenger_pubkey=$2 OR challengee_pubkey=$2) RETURNING *`,
    [id, pubkey],
  );
  return res.rows[0] ? map(res.rows[0]) : null;
}

export async function setChallengeStatus(id: string, status: NegotiationStatus): Promise<void> {
  await query('UPDATE challenges SET status = $2 WHERE challenge_id = $1', [id, status]);
}

export async function expireStaleChallenges(): Promise<void> {
  await query("UPDATE challenges SET status='EXPIRED' WHERE status IN ('PENDING','COUNTERED') AND expires_at < NOW()");
}

/** Active negotiations where the user is challenger or challengee (not expired). */
export async function listActiveForUser(pubkey: string): Promise<Negotiation[]> {
  const res = await query<ChallengeDbRow>(
    `SELECT * FROM challenges
     WHERE (challenger_pubkey = $1 OR challengee_pubkey = $1)
       AND status IN ('PENDING','COUNTERED')
       AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [pubkey],
  );
  return res.rows.map(map);
}
