import { describe, it, expect } from 'vitest';
import { Protocol } from '@pkmn/protocol';
import { normalizeCardName } from '@battler/card-parser';
import type { BattleProfile, CardAttributes } from '@battler/core';
import { buildTeam, deriveBattleProfile, runBotBattle } from '../index.js';

function attrs(rarity = 'Rare'): CardAttributes {
  return {
    grade: '9',
    gradingCompany: 'PSA',
    set: 'Test',
    cardNumber: '1/1',
    rarity,
    year: '2022',
    language: 'English',
    certNumber: null,
  };
}

async function team(names: string[], salt: string): Promise<BattleProfile[]> {
  const out: BattleProfile[] = [];
  for (let i = 0; i < names.length; i++) {
    const d = await deriveBattleProfile(`${salt}_${names[i]}_${i}`, normalizeCardName(names[i]!), attrs());
    out.push(d.profile);
  }
  return out;
}

describe('Phase 7 GATE — full 6v6 bot-vs-bot battle', () => {
  it('runs to completion with a winner and no sim errors', async () => {
    const t1 = buildTeam(await team(['Charizard', 'Blastoise', 'Venusaur', 'Snorlax', 'Garchomp', 'Pikachu'], 'a'));
    const t2 = buildTeam(await team(['Greninja', 'Dragonite', 'Gengar', 'Tyranitar', 'Lucario', 'Metagross'], 'b'));

    const result = await runBotBattle(t1, t2, { maxTurns: 500 });

    // no "[Invalid choice]" / sim errors
    expect(result.errors).toEqual([]);
    expect(result.turns).toBeGreaterThan(0);
    // ends decisively (winner) or as a capped tie
    expect(result.winner !== null || result.tie).toBe(true);

    // every protocol line parses without throwing
    let parsed = 0;
    for (const line of result.log) {
      if (!line.startsWith('|')) continue;
      expect(() => Protocol.parseBattleLine(line)).not.toThrow();
      parsed++;
    }
    expect(parsed).toBeGreaterThan(0);
  }, 60_000);
});
