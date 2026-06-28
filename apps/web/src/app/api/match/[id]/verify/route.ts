import { NextResponse } from 'next/server';
import { signLogHash } from '@battler/server-kit';
import { matches } from '@battler/repositories';

export const runtime = 'nodejs';

/**
 * GET /api/match/:id/verify — dispute resolution. Returns the full battle log,
 * its SHA-256 hash, the server signature, and (for ES256) the public key so
 * anyone can independently verify the result was not tampered with.
 */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  const record = await matches.getMatchVerification(id);
  if (!record || !record.battleLogHash) {
    return NextResponse.json({ error: 'match not found or not completed' }, { status: 404 });
  }
  const signed = signLogHash(record.battleLogHash);
  return NextResponse.json({
    matchId: id,
    log: record.battleLog,
    hash: signed.hash,
    signature: signed.signature,
    alg: signed.alg,
    publicKey: signed.publicKey,
  });
}
