import nacl from 'tweetnacl';
import bs58 from 'bs58';

/**
 * Sign-In With Solana. The server builds the canonical message text (including a
 * server-issued nonce) and returns it for the wallet to sign verbatim. On
 * verify we check the ed25519 signature over that exact text and that the
 * embedded nonce + domain match — proving wallet ownership, no password.
 */
export interface SiwsParams {
  domain: string;
  address: string; // base58 pubkey
  statement: string;
  uri: string;
  version: string;
  chainId: string;
  nonce: string;
  issuedAt: string; // ISO timestamp
  expirationTime?: string;
}

export function buildSiwsMessage(p: SiwsParams): string {
  const lines = [
    `${p.domain} wants you to sign in with your Solana account:`,
    p.address,
    '',
    p.statement,
    '',
    `URI: ${p.uri}`,
    `Version: ${p.version}`,
    `Chain ID: ${p.chainId}`,
    `Nonce: ${p.nonce}`,
    `Issued At: ${p.issuedAt}`,
  ];
  if (p.expirationTime) lines.push(`Expiration Time: ${p.expirationTime}`);
  return lines.join('\n');
}

/** Verify an ed25519 signature (base58) over a UTF-8 message for a base58 pubkey. */
export function verifySignature(message: string, signatureB58: string, pubkeyB58: string): boolean {
  try {
    const msgBytes = new TextEncoder().encode(message);
    const sig = bs58.decode(signatureB58);
    const pub = bs58.decode(pubkeyB58);
    if (sig.length !== 64 || pub.length !== 32) return false;
    return nacl.sign.detached.verify(msgBytes, sig, pub);
  } catch {
    return false;
  }
}

/** Full SIWS verification: signature valid AND nonce/domain match expectations. */
export function verifySiws(opts: {
  message: string;
  signatureB58: string;
  pubkeyB58: string;
  expectedNonce: string;
  expectedDomain: string;
}): boolean {
  if (!verifySignature(opts.message, opts.signatureB58, opts.pubkeyB58)) return false;
  if (!opts.message.includes(`Nonce: ${opts.expectedNonce}`)) return false;
  if (!opts.message.includes(opts.expectedDomain)) return false;
  if (!opts.message.includes(opts.pubkeyB58)) return false;
  return true;
}
