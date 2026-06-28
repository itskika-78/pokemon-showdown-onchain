import { describe, it, expect } from 'vitest';
import { normalizeCardName } from '../index.js';

/**
 * Phase 4 GATE: every one of these must pass before derivation is trusted.
 * (Specified verbatim in the build plan.)
 */
describe('normalizeCardName — the 16 gated cases (real Phygitals + TCG names)', () => {
  const cases: {
    name: string;
    speciesId: string;
    cardTier?: string;
    ownerPrefix?: string;
    rarityPrefix?: string;
  }[] = [
    { name: '2023 Camerupt Obsidian Flames #148/197', speciesId: 'camerupt' },
    { name: 'Charizard VMAX PSA 10 #20/189', speciesId: 'charizard', cardTier: 'VMAX' },
    { name: 'Dark Charizard #4/82', speciesId: 'charizard', ownerPrefix: 'Dark' },
    { name: 'Pikachu V', speciesId: 'pikachu', cardTier: 'V' },
    { name: 'Radiant Greninja', speciesId: 'greninja', rarityPrefix: 'Radiant' },
    { name: "Team Rocket's Meowth", speciesId: 'meowth', ownerPrefix: "Team Rocket's" },
    { name: "Misty's Starmie PSA 9", speciesId: 'starmie', ownerPrefix: "Misty's" },
    { name: 'Mewtwo GX', speciesId: 'mewtwo', cardTier: 'GX' },
    { name: 'Alolan Raichu', speciesId: 'raichualola' },
    { name: 'Galarian Rapidash V', speciesId: 'rapidashgalar', cardTier: 'V' },
    { name: 'Arceus VSTAR #123/189', speciesId: 'arceus', cardTier: 'VSTAR' },
    { name: 'Pikachu VMAX #188/185 BGS 9.5', speciesId: 'pikachu', cardTier: 'VMAX' },
    { name: 'Charizard & Braixen-GX #22/236', speciesId: 'charizard' },
    { name: 'Mr. Mime', speciesId: 'mrmime' },
    { name: 'Nidoran', speciesId: 'nidoranf' },
  ];

  for (const c of cases) {
    it(`"${c.name}"`, () => {
      const r = normalizeCardName(c.name);
      expect(r.speciesId).toBe(c.speciesId);
      expect(r.playable).toBe(true);
      if (c.cardTier) expect(r.cardTier).toBe(c.cardTier);
      if (c.ownerPrefix) expect(r.ownerPrefix).toBe(c.ownerPrefix);
      if (c.rarityPrefix) expect(r.rarityPrefix).toBe(c.rarityPrefix);
    });
  }

  it('"2024 Pokemon Japanese SV Terasta" → generic set card, unplayable', () => {
    const r = normalizeCardName('2024 Pokemon Japanese SV Terasta');
    expect(r.playable).toBe(false);
    expect(r.parseFailReason).toBe('generic_set_card');
  });
});

describe('normalizeCardName — non-Pokémon & failures', () => {
  for (const name of ['Basic Fire Energy', 'Professor Oak', 'Ultra Ball']) {
    it(`"${name}" is unplayable`, () => {
      const r = normalizeCardName(name);
      expect(r.playable).toBe(false);
      expect(r.speciesId).toBeNull();
    });
  }
});

describe('normalizeCardName — deterministic', () => {
  it('same input → identical output', () => {
    const a = normalizeCardName("Misty's Starmie PSA 9");
    const b = normalizeCardName("Misty's Starmie PSA 9");
    expect(a).toEqual(b);
  });
});
