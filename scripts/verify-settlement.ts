/**
 * Live verification of the wagered settlement path against real Postgres
 * (PgLedgerStore): double-entry credits, 2.5% platform fee, and idempotency.
 *   tsx scripts/verify-settlement.ts
 */
import { randomUUID } from 'node:crypto';
import pglib from 'pg';
import { LedgerSettlementService, PgLedgerStore } from '@battler/settlement';

const conn = process.env.DATABASE_URL ?? 'postgres://battler:battler@localhost:5432/battler';
const STAKE = 1000;

async function main() {
  const db = new pglib.Client({ connectionString: conn });
  await db.connect();

  const ts = Date.now();
  const alice = `settletest_alice_${ts}`;
  const bob = `settletest_bob_${ts}`;
  await db.query('INSERT INTO users (pubkey, ledger_balance) VALUES ($1,$2),($3,$4)', [
    alice, 1000, bob, 1000,
  ]);
  const matchId = randomUUID();
  await db.query(
    `INSERT INTO matches (id, p1_pubkey, p2_pubkey, wager_type, wager_amount, status)
     VALUES ($1,$2,$3,'crypto',$4,'active')`,
    [matchId, alice, bob, STAKE],
  );

  const treasuryBefore = Number(
    (await db.query("SELECT ledger_balance FROM users WHERE pubkey='PLATFORM_TREASURY'")).rows[0]
      .ledger_balance,
  );

  const svc = new LedgerSettlementService(new PgLedgerStore(), 250); // 2.5%
  const r1 = await svc.settle({ matchId, winner: alice, loser: bob });
  console.log('settle #1 →', JSON.stringify({ applied: r1.applied, feeTaken: r1.feeTaken }));
  const r2 = await svc.settle({ matchId, winner: alice, loser: bob });
  console.log('settle #2 (retry) →', JSON.stringify({ applied: r2.applied, alreadySettled: r2.alreadySettled }));

  const bal = await db.query(
    'SELECT pubkey, ledger_balance FROM users WHERE pubkey IN ($1,$2) ORDER BY pubkey',
    [alice, bob],
  );
  const treasuryAfter = Number(
    (await db.query("SELECT ledger_balance FROM users WHERE pubkey='PLATFORM_TREASURY'")).rows[0]
      .ledger_balance,
  );
  const led = await db.query(
    'SELECT user_pubkey, delta, balance_after, reason FROM ledger_entries WHERE match_id=$1 ORDER BY id',
    [matchId],
  );
  const mr = await db.query('SELECT status, fee_taken, winner_pubkey FROM matches WHERE id=$1', [matchId]);

  console.log('\nbalances (start 1000 each):');
  console.table(bal.rows.map((x) => ({ pubkey: x.pubkey.replace(`_${ts}`, ''), balance: x.ledger_balance })));
  console.log(`treasury fee delta: +${treasuryAfter - treasuryBefore}`);
  console.log('\nledger entries:');
  console.table(led.rows.map((x) => ({ user: x.user_pubkey.replace(`_${ts}`, ''), delta: x.delta, balance_after: x.balance_after, reason: x.reason })));
  console.log('match:', JSON.stringify(mr.rows[0]));

  const sum = led.rows.reduce((s, x) => s + Number(x.delta), 0);
  const winnerBal = Number(bal.rows.find((x) => x.pubkey === alice)!.ledger_balance);
  const loserBal = Number(bal.rows.find((x) => x.pubkey === bob)!.ledger_balance);
  const ok =
    sum === 0 && // double-entry balances to zero
    r1.feeTaken === 25 && // 2.5% of 1000
    winnerBal === 1975 && // +975 payout
    loserBal === 0 && // -1000 stake
    !r2.applied && r2.alreadySettled && // idempotent
    mr.rows[0].status === 'complete';
  console.log(`\n${ok ? '✅ PASS' : '❌ FAIL'} — double-entry sums to ${sum}, fee=${r1.feeTaken}, winner=${winnerBal}, loser=${loserBal}, idempotent=${!r2.applied && r2.alreadySettled}`);

  await db.end();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
