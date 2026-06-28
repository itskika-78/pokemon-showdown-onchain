import crypto from 'node:crypto';
import { loadServerConfig } from './config.js';

export function sha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

export function hmacHex(secret: string, data: string): string {
  return crypto.createHmac('sha256', secret).update(data, 'utf8').digest('hex');
}

export interface SignedHash {
  hash: string;
  signature: string;
  /** 'ES256' when an ECDSA key is configured, else 'HS256' (HMAC). */
  alg: 'ES256' | 'HS256';
  /** SPKI-PEM public key for ES256 so anyone can verify; null for HMAC. */
  publicKey: string | null;
}

/**
 * Sign a battle-log hash for dispute resolution. Uses an ECDSA private key
 * (LOG_SIGNING_PRIVATE_KEY, PEM) when present so signatures are publicly
 * verifiable; otherwise falls back to HMAC with LOG_SIGNING_SECRET (dev).
 */
export function signLogHash(hashHex: string): SignedHash {
  const cfg = loadServerConfig();
  if (cfg.logSigning.privateKeyPem) {
    const key = crypto.createPrivateKey(cfg.logSigning.privateKeyPem);
    const signature = crypto.sign('sha256', Buffer.from(hashHex), key).toString('base64');
    const publicKey = crypto
      .createPublicKey(key)
      .export({ type: 'spki', format: 'pem' })
      .toString();
    return { hash: hashHex, signature, alg: 'ES256', publicKey };
  }
  return { hash: hashHex, signature: hmacHex(cfg.logSigning.secret, hashHex), alg: 'HS256', publicKey: null };
}

export function verifyLogHash(signed: SignedHash): boolean {
  const cfg = loadServerConfig();
  if (signed.alg === 'ES256') {
    if (!signed.publicKey) return false;
    try {
      return crypto.verify(
        'sha256',
        Buffer.from(signed.hash),
        crypto.createPublicKey(signed.publicKey),
        Buffer.from(signed.signature, 'base64'),
      );
    } catch {
      return false;
    }
  }
  return hmacHex(cfg.logSigning.secret, signed.hash) === signed.signature;
}

/** Per-turn state HMAC stored in Redis for anti-cheat / dispute trails. */
export function turnStateHash(roomId: string, turn: number, stateJson: string): string {
  return hmacHex(loadServerConfig().logSigning.secret, `${roomId}:${turn}:${stateJson}`);
}
