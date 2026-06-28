import { describe, it, expect } from 'vitest';
import { collectionOf } from '@battler/core';
import {
  MockDasProvider,
  MOCK_COLLECTION_MINT,
  HeliusDasProvider,
  extractAttributes,
  filterSupportedCollections,
  partitionWalletAssets,
  summarizeAsset,
} from '../index.js';

/** Build a fetch stub that returns a JSON-RPC body, optionally failing first N times. */
function rpcFetch(handler: (callCount: number) => { status?: number; body?: unknown }): {
  fetch: typeof fetch;
  calls: () => number;
} {
  let calls = 0;
  const f = (async () => {
    calls += 1;
    const { status = 200, body = { result: { items: [] } } } = handler(calls);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
  return { fetch: f, calls: () => calls };
}

describe('extractAttributes — standard Phygitals schema', () => {
  it('pulls grade/company/set/number/rarity/year from attributes', async () => {
    const das = new MockDasProvider();
    const assets = await das.getAssetsByOwner('OwnerWalletAAAAAAAA');
    const charizard = assets.find((a) => a.content?.metadata?.name?.startsWith('Charizard'))!;
    const attrs = extractAttributes(charizard);
    expect(attrs).toEqual({
      grade: '10',
      gradingCompany: 'PSA',
      set: "Champion's Path",
      cardNumber: '20/189',
      rarity: 'Secret Rare',
      year: '2020',
      language: null,
      certNumber: null,
    });
  });

  it('parses the real Phygitals-style Camerupt card incl. language + cert', async () => {
    const das = new MockDasProvider();
    const assets = await das.getAssetsByOwner('OwnerCamerupt');
    const camerupt = assets.find((a) => a.content?.metadata?.name?.includes('Camerupt'))!;
    const attrs = extractAttributes(camerupt);
    expect(attrs).toEqual({
      grade: '10',
      gradingCompany: 'PSA',
      set: 'Obsidian Flames',
      cardNumber: '148/197',
      rarity: 'Uncommon',
      year: '2023',
      language: 'English',
      certNumber: '12345678',
    });
    expect(summarizeAsset(camerupt).speciesId).toBe('camerupt');
  });
});

describe('summarizeAsset — combines DAS + parser', () => {
  it('marks Pokémon cards playable and non-Pokémon cards unplayable', async () => {
    const das = new MockDasProvider();
    const assets = await das.getAssetsByOwner('OwnerWalletBBBBBBBB');
    const cards = assets.map(summarizeAsset);

    const charizard = cards.find((c) => c.cardName.startsWith('Charizard VMAX'))!;
    expect(charizard.speciesId).toBe('charizard');
    expect(charizard.playable).toBe(true);
    expect(charizard.grade).toBe('10');

    const energy = cards.find((c) => c.cardName === 'Basic Fire Energy')!;
    expect(energy.playable).toBe(false);
    expect(energy.speciesId).toBeNull();
  });
});

describe('filterSupportedCollections', () => {
  it('keeps only supported collection mints, or all (compressed) when set is empty', async () => {
    const das = new MockDasProvider();
    const assets = await das.getAssetsByOwner('OwnerWalletCCCCCCCC');
    // Mock wallet now also holds foreign + non-compressed assets; counts derive from the data.
    const compressed = assets.filter((a) => a.compression?.compressed === true);
    const inCollection = compressed.filter((a) => collectionOf(a) === MOCK_COLLECTION_MINT);
    expect(inCollection.length).toBeGreaterThan(0);

    expect(filterSupportedCollections(assets, new Set()).length).toBe(compressed.length);
    expect(filterSupportedCollections(assets, new Set([MOCK_COLLECTION_MINT])).length).toBe(
      inCollection.length,
    );
    expect(filterSupportedCollections(assets, new Set(['SomeOtherMint'])).length).toBe(0);
  });
});

describe('partitionWalletAssets — Pokémon cards vs everything else', () => {
  it('splits supported Pokémon-card cNFTs from foreign / non-compressed assets', async () => {
    const das = new MockDasProvider();
    const assets = await das.getAssetsByOwner('OwnerWalletPartition');
    const { supported, unsupported } = partitionWalletAssets(
      assets,
      new Set([MOCK_COLLECTION_MINT]),
    );

    // Every supported asset is a compressed cNFT in the supported collection.
    expect(supported.length).toBeGreaterThan(0);
    for (const a of supported) {
      expect(a.compression?.compressed).toBe(true);
      expect(collectionOf(a)).toBe(MOCK_COLLECTION_MINT);
    }

    // The foreign PFPs surface as unsupported with the right reasons.
    const byName = (frag: string) => unsupported.find((u) => u.asset.content?.metadata?.name?.includes(frag));
    expect(byName('Mad Lads')?.reason).toBe('wrong_collection');
    expect(byName('Okay Bear')?.reason).toBe('not_compressed');

    // Nothing is lost or double-counted (no burnt/fungible in the mock set).
    expect(supported.length + unsupported.length).toBe(assets.length);
  });
});

describe('MockDasProvider — ownership mutation (for reverify path)', () => {
  it('re-fetching an asset reflects a transferred owner', async () => {
    const das = new MockDasProvider();
    const [first] = await das.getAssetsByOwner('OwnerWalletDDDDDDDD');
    expect(first!.ownership.owner).toBe('OwnerWalletDDDDDDDD');
    das.setOwner(first!.id, 'NewOwnerEEEEEEEE');
    const refetched = await das.getAsset(first!.id);
    expect(refetched?.ownership.owner).toBe('NewOwnerEEEEEEEE');
  });
});

describe('HeliusDasProvider — resilience + probe', () => {
  it('retries transient errors (HTTP 429) then succeeds', async () => {
    const stub = rpcFetch((n) =>
      n < 3 ? { status: 429 } : { status: 200, body: { result: { items: [] } } },
    );
    const provider = new HeliusDasProvider('https://rpc.test', stub.fetch, 1_000, 3);
    const assets = await provider.getAssetsByOwner('OwnerX');
    expect(assets).toEqual([]);
    expect(stub.calls()).toBe(3); // failed twice, succeeded on the third
  });

  it('does NOT retry a non-transient error (HTTP 401 bad key)', async () => {
    const stub = rpcFetch(() => ({ status: 401 }));
    const provider = new HeliusDasProvider('https://rpc.test', stub.fetch, 1_000, 3);
    await expect(provider.getAssetsByOwner('OwnerX')).rejects.toThrow(/HTTP 401/);
    expect(stub.calls()).toBe(1); // gave up immediately
  });

  it('paginates getAssetsByOwner until a short page', async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({ id: `a${i}` }));
    const stub = rpcFetch((n) =>
      n === 1
        ? { body: { result: { items: full } } }
        : { body: { result: { items: [{ id: 'last' }] } } },
    );
    const provider = new HeliusDasProvider('https://rpc.test', stub.fetch, 1_000, 1);
    const assets = await provider.getAssetsByOwner('Whale');
    expect(assets.length).toBe(1001);
    expect(stub.calls()).toBe(2);
  });

  it('probe() reports reachability + latency on success', async () => {
    const stub = rpcFetch(() => ({ body: { result: { items: [{ id: 'x' }] } } }));
    const provider = new HeliusDasProvider('https://rpc.test', stub.fetch, 1_000, 1);
    const r = await provider.probe();
    expect(r.ok).toBe(true);
    expect(r.sampleAssets).toBe(1);
    expect(typeof r.latencyMs).toBe('number');
  });

  it('probe() returns a clean error (no throw) when the endpoint rejects', async () => {
    const stub = rpcFetch(() => ({ status: 403 }));
    const provider = new HeliusDasProvider('https://rpc.test', stub.fetch, 1_000, 1);
    const r = await provider.probe();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/HTTP 403/);
  });
});
