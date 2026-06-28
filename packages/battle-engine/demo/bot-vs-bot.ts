/**
 * Headless demo: derive two teams from card names and run a full bot-vs-bot
 * battle, printing the tail of the protocol log and the winner.
 *   pnpm demo:battle
 */
import { normalizeCardName } from '@battler/card-parser';
import type { CardAttributes } from '@battler/core';
import { buildTeam, deriveBattleProfile, runBotBattle } from '../src/index.js';

const attrs = (rarity: string): CardAttributes => ({
  grade: '9',
  gradingCompany: 'PSA',
  set: 'Demo',
  cardNumber: '1/1',
  rarity,
  year: '2022',
  language: 'English',
  certNumber: null,
});

async function team(names: string[], salt: string) {
  const profiles = [];
  for (let i = 0; i < names.length; i++) {
    const d = await deriveBattleProfile(`${salt}_${i}_${names[i]}`, normalizeCardName(names[i]!), attrs('Ultra Rare'));
    profiles.push(d.profile);
    console.log(
      `  ${salt} ${d.profile.species.padEnd(12)} Lv${d.profile.level}  ${d.profile.nature} ${d.profile.ability}  [${d.profile.moves.join(', ')}]`,
    );
  }
  return buildTeam(profiles);
}

async function main() {
  console.log('Team A:');
  const a = await team(['Charizard VMAX', 'Garchomp', 'Tyranitar', 'Greninja', 'Snorlax', 'Metagross'], 'A');
  console.log('Team B:');
  const b = await team(['Dragonite', 'Gengar', 'Lucario', 'Blastoise', 'Venusaur', 'Pikachu'], 'B');

  console.log('\nRunning battle…\n');
  const result = await runBotBattle(a, b, { maxTurns: 500 });

  for (const line of result.log.slice(-25)) if (line) console.log(line);
  console.log('\n──────────────');
  console.log(`turns: ${result.turns}  errors: ${result.errors.length}`);
  console.log(result.tie ? 'Result: TIE' : `Winner: ${result.winner}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
