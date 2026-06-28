'use client';

import { useState } from 'react';
import type { UnsupportedAsset } from '@/lib/api';

const REASON_LABEL: Record<UnsupportedAsset['reason'], string> = {
  wrong_collection: 'Unsupported collection',
  not_compressed: 'Not a cNFT',
  not_a_pokemon: 'Not a Pokémon',
};

const REASON_HINT: Record<UnsupportedAsset['reason'], string> = {
  wrong_collection: 'A compressed NFT from a collection we don’t support for battle yet.',
  not_compressed: 'A regular (non-compressed) NFT — not a Phygitals card cNFT.',
  not_a_pokemon: 'A Pokémon TCG card, but an energy/trainer/unparseable card — it can’t battle.',
};

function shortMint(mint: string | null): string | null {
  if (!mint) return null;
  return mint.length > 12 ? `${mint.slice(0, 4)}…${mint.slice(-4)}` : mint;
}

/** A muted, non-interactive tile for wallet assets that can't enter battle. */
export function UnsupportedTile({ asset }: { asset: UnsupportedAsset }) {
  const [broken, setBroken] = useState(false);
  const mint = shortMint(asset.collectionMint);
  const initial = (asset.name.replace(/[^A-Za-z0-9]/g, '')[0] ?? '?').toUpperCase();

  return (
    <div className="unsup-tile" title={REASON_HINT[asset.reason]}>
      <div className="unsup-thumb">
        {asset.image && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.image} alt={asset.name} loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <div className="unsup-fallback" aria-hidden>{initial}</div>
        )}
        <span className={`unsup-reason reason-${asset.reason}`}>{REASON_LABEL[asset.reason]}</span>
      </div>
      <div className="unsup-meta">
        <p className="unsup-name" title={asset.name}>{asset.name}</p>
        <p className="unsup-sub">
          {asset.compressed ? 'cNFT' : 'NFT'}
          {mint ? <> · <span className="mono">{mint}</span></> : null}
        </p>
      </div>
    </div>
  );
}
