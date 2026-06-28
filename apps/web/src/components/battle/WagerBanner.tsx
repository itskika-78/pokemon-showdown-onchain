'use client';

import { Pokeball } from '@/components/Pokeball';

export function WagerBanner() {
  return (
    <div className="stake-banner game-panel">
      <Pokeball size={22} />
      The opponent needs the <strong>Battle</strong> tab open to receive your challenge. Both trainers need a saved team.
    </div>
  );
}
