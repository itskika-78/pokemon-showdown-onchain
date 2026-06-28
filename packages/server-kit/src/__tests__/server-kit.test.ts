import { describe, it, expect } from 'vitest';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { _resetConfigForTests, loadServerConfig } from '../config.js';
import { buildSiwsMessage, verifySiws, verifySignature } from '../siws.js';
import { sha256Hex, signLogHash, verifyLogHash, hmacHex } from '../signing.js';
import { MemoryKv } from '../memory-kv.js';
import { computeFee } from '@battler/core';

describe('config — zod validation', () => {
  it('loads sensible defaults in development', () => {
    _resetConfigForTests();
    const cfg = loadServerConfig({ NODE_ENV: 'development' } as NodeJS.ProcessEnv);
    expect(cfg.battleFormat).toBe('gen9customgame');
    expect(cfg.platformFeeBps).toBe(250);
    expect(cfg.useMockDas).toBe(true);
  });

  it('crashes in production when JWT_SECRET is the dev default', () => {
    _resetConfigForTests();
    expect(() => loadServerConfig({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(/JWT_SECRET/);
    _resetConfigForTests();
  });

  it('parses PHYGITALS_COLLECTION_MINTS into a set', () => {
    _resetConfigForTests();
    const cfg = loadServerConfig({ PHYGITALS_COLLECTION_MINTS: 'a, b ,c' } as NodeJS.ProcessEnv);
    expect([...cfg.supportedCollections].sort()).toEqual(['a', 'b', 'c']);
    _resetConfigForTests();
  });
});

describe('SIWS — ed25519 sign/verify', () => {
  it('verifies a wallet signature over the canonical message', () => {
    const kp = nacl.sign.keyPair();
    const pubkey = bs58.encode(kp.publicKey);
    const nonce = 'test-nonce-123';
    const message = buildSiwsMessage({
      domain: 'localhost:3000',
      address: pubkey,
      statement: 'Sign in to PokéChain',
      uri: 'http://localhost:3000',
      version: '1',
      chainId: 'solana:mainnet',
      nonce,
      issuedAt: new Date().toISOString(),
    });
    const sig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey));

    expect(verifySignature(message, sig, pubkey)).toBe(true);
    expect(
      verifySiws({ message, signatureB58: sig, pubkeyB58: pubkey, expectedNonce: nonce, expectedDomain: 'localhost:3000' }),
    ).toBe(true);
  });

  it('rejects a tampered message', () => {
    const kp = nacl.sign.keyPair();
    const pubkey = bs58.encode(kp.publicKey);
    const message = 'original';
    const sig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey));
    expect(verifySignature('tampered', sig, pubkey)).toBe(false);
  });
});

describe('signing — battle-log hashes', () => {
  it('HMAC sign + verify round-trips and matches sha256', () => {
    _resetConfigForTests();
    loadServerConfig({} as NodeJS.ProcessEnv);
    const log = '|move|p1a: Charizard|Flamethrower\n|-damage|p2a: Blastoise|0 fnt';
    const hash = sha256Hex(log);
    const signed = signLogHash(hash);
    expect(signed.alg).toBe('HS256');
    expect(signed.hash).toBe(hash);
    expect(verifyLogHash(signed)).toBe(true);
    expect(signed.signature).toBe(hmacHex('dev-only-log-signing-secret', hash));
    _resetConfigForTests();
  });
});

describe('MemoryKv — matchmaking fallback (no Redis)', () => {
  it('pops queued players in join order (ZPOPMIN) and stashes teams (HSET/HGET)', async () => {
    const kv = new MemoryKv();
    // two players join the matchmaking queue, scored by join time
    await kv.hset('teams', 'alice', JSON.stringify(['a1', 'a2']));
    await kv.zadd('queue', 1000, 'alice');
    await kv.hset('teams', 'bob', JSON.stringify(['b1']));
    await kv.zadd('queue', 1001, 'bob');

    // matchmaker pops the two earliest as a flat [member, score, member, score]
    const popped = await kv.zpopmin('queue', 2);
    expect(popped).toEqual(['alice', '1000', 'bob', '1001']);
    expect(await kv.zpopmin('queue', 2)).toEqual([]); // queue drained

    // teams come back, then get cleared
    expect(await kv.hget('teams', 'alice')).toBe(JSON.stringify(['a1', 'a2']));
    expect(await kv.hdel('teams', 'alice', 'bob')).toBe(2);
    expect(await kv.hget('teams', 'alice')).toBeNull();
  });

  it('zadd updates the score of an existing member and zrem removes it', async () => {
    const kv = new MemoryKv();
    expect(await kv.zadd('q', 5, 'x')).toBe(1); // new
    expect(await kv.zadd('q', 2, 'x')).toBe(0); // re-scored, not new
    expect(await kv.zadd('q', 9, 'y')).toBe(1);
    // lowest score (x@2) pops first despite joining first at score 5
    expect(await kv.zpopmin('q', 1)).toEqual(['x', '2']);
    expect(await kv.zrem('q', 'y')).toBe(1);
    expect(await kv.zpopmin('q', 1)).toEqual([]);
  });
});

describe('computeFee (core)', () => {
  it('takes 2.5% and leaves the payout', () => {
    expect(computeFee(1000, 250)).toEqual({ fee: 25, payout: 975 });
    expect(computeFee(333, 250)).toEqual({ fee: 8, payout: 325 });
  });
});
