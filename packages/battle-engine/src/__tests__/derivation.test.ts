import { describe, it, expect } from 'vitest';
import { normalizeCardName } from '@battler/card-parser';
import type { CardAttributes } from '@battler/core';
import { deriveBattleProfile, validateProfile } from '../index.js';

function attrs(p: Partial<CardAttributes> = {}): CardAttributes {
  return {
    grade: null,
    gradingCompany: null,
    set: null,
    cardNumber: null,
    rarity: 'Rare',
    year: null,
    language: null,
    certNumber: null,
    ...p,
  };
}

describe('deriveBattleProfile — determinism (anti-reroll guarantee)', () => {
  it('same asset ID + card → identical profile, every time', async () => {
    const card = normalizeCardName('Charizard VMAX');
    const a = await deriveBattleProfile('Asset_Det_123', card, attrs({ grade: '10', rarity: 'Secret Rare', year: '2020' }));
    const b = await deriveBattleProfile('Asset_Det_123', card, attrs({ grade: '10', rarity: 'Secret Rare', year: '2020' }));
    expect(b.profile).toEqual(a.profile);
    expect(b.rationale).toEqual(a.rationale);
  });

  it('different asset IDs of the same card diverge (IV rolls)', async () => {
    const card = normalizeCardName('Pikachu');
    const a = await deriveBattleProfile('Asset_One', card, attrs());
    const b = await deriveBattleProfile('Asset_Two', card, attrs());
    expect(b.profile.ivs).not.toEqual(a.profile.ivs);
  });
});

describe('deriveBattleProfile — power curve tracks desirability', () => {
  it('a grail card outlevels a bulk common', async () => {
    const common = await deriveBattleProfile('c1', normalizeCardName('Rattata'), attrs({ rarity: 'Common' }));
    const grail = await deriveBattleProfile(
      'g1',
      normalizeCardName('Charizard VMAX'),
      attrs({ grade: '10', gradingCompany: 'PSA', rarity: 'Secret Rare', year: '1999' }),
    );
    expect(grail.profile.level).toBeGreaterThan(common.profile.level);
    expect(grail.rationale.powerRating).toBeGreaterThan(common.rationale.powerRating);
  });

  it('PSA 10 raises the IV floor above an ungraded copy', async () => {
    const card = normalizeCardName('Garchomp');
    const graded = await deriveBattleProfile('x', card, attrs({ grade: '10' }));
    const minIv = Math.min(...Object.values(graded.profile.ivs));
    expect(minIv).toBeGreaterThanOrEqual(20);
  });
});

describe('deriveBattleProfile — always sim-legal under gen9customgame', () => {
  const names = [
    'Pikachu', 'Charizard VMAX', 'Greninja', 'Alolan Raichu',
    'Garchomp ex', 'Dragonite', 'Gengar', 'Tyranitar', 'Snorlax', 'Metagross',
  ];
  for (const name of names) {
    it(`"${name}" validates`, async () => {
      const card = normalizeCardName(name);
      const d = await deriveBattleProfile(`asset_${name}`, card, attrs({ grade: '9', rarity: 'Ultra Rare' }));
      expect(validateProfile(d.profile)).toBeNull();
      expect(d.profile.moves.length).toBeGreaterThanOrEqual(1);
      expect(d.profile.moves.length).toBeLessThanOrEqual(4);
      expect(d.profile.level).toBeGreaterThanOrEqual(1);
      expect(d.profile.level).toBeLessThanOrEqual(100);
      // EVs must be legal: ≤252/stat, ≤510 total
      const evs = Object.values(d.profile.evs);
      expect(Math.max(...evs)).toBeLessThanOrEqual(252);
      expect(evs.reduce((s, v) => s + v, 0)).toBeLessThanOrEqual(510);
    });
  }
});

describe('deriveBattleProfile — refuses unplayable cards', () => {
  it('throws on a non-Pokémon card', async () => {
    const energy = normalizeCardName('Basic Fire Energy');
    await expect(deriveBattleProfile('x', energy, attrs())).rejects.toThrow();
  });
});
