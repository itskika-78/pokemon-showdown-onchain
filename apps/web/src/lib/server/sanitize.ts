import bs58 from 'bs58';

/** A Solana pubkey is 32 bytes base58. Validate before trusting client input. */
export function isValidPubkey(s: unknown): s is string {
  if (typeof s !== 'string' || s.length < 32 || s.length > 44) return false;
  try {
    return bs58.decode(s).length === 32;
  } catch {
    return false;
  }
}

/**
 * Asset IDs are base58 cNFT addresses on mainnet. In dev (mock provider) they
 * are deterministic `mock_<hex>_<idx>` ids, and user-added cards are
 * `custom_<hex>_<seq>` — accept those too. The real protection downstream is the
 * ownership check + parameterized queries, not this format guard.
 */
export function isValidAssetId(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  try {
    if (bs58.decode(s).length === 32) return true;
  } catch {
    /* not a base58 pubkey */
  }
  if (s.startsWith('custom_') || s.startsWith('devnet_') || s.startsWith('mock_')) {
    return s.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(s);
  }
  return false;
}

/** Clamp + strip ASCII control characters from short free-text fields. */
export function sanitizeText(s: unknown, maxLen = 200): string {
  if (typeof s !== 'string') return '';
  const cleaned = Array.from(s)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code !== 127; // drop C0 controls + DEL
    })
    .join('');
  return cleaned.slice(0, maxLen).trim();
}
