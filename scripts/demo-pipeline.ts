/**
 * End-to-end pipeline demo (no DB needed): mock DAS → parse → derive.
 * Shows how each card in a mock wallet becomes a Pokémon (or is rejected).
 *   pnpm demo:pipeline
 */
import { nameOf } from '@battler/core';
import { MockDasProvider, extractAttributes } from '@battler/das';
import { normalizeCardName } from '@battler/card-parser';
import { deriveBattleProfile } from '@battler/battle-engine';

async function main() {
  const das = new MockDasProvider();
  const assets = await das.getAssetsByOwner('DemoOwnerWallet1111111111111111111');

  for (const asset of assets) {
    const name = nameOf(asset);
    const card = normalizeCardName(name);
    const attrs = extractAttributes(asset);

    if (!card.playable || !card.speciesId) {
      console.log(`\n❌ ${name}\n   unplayable (${card.parseFailReason})`);
      continue;
    }
    const { profile, rationale } = await deriveBattleProfile(asset.id, card, attrs);
    console.log(`\n✅ ${name}`);
    console.log(`   species: ${profile.species}  Lv${profile.level}  ${profile.nature}  ${profile.ability}`);
    console.log(`   moves:   ${profile.moves.join(', ')}`);
    console.log(`   why:     ${rationale.notes.join(' | ')}`);
    console.log(`   power:   ${rationale.powerRating}/100`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
