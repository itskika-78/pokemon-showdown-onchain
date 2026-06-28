import { Dex } from '@pkmn/dex';

/**
 * We source species/move/learnset data from @pkmn/dex's Dex — the SAME species
 * universe as the parser (@pkmn/dex) and the validator/battle (@pkmn/sim), which
 * includes National-Dex "Past" species (Rattata, etc.). The @pkmn/data gen
 * layer over-filters those out, so we deliberately do not use it here: a card
 * battler must let every Pokémon play, and gen9customgame accepts Past species.
 */
export { Dex };

export type Species = ReturnType<typeof Dex.species.get>;
export type MoveData = ReturnType<typeof Dex.moves.get>;
