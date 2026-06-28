import { query } from '@battler/server-kit';

/** A user-added mock card (dev-only "Add Card" feature). */
export interface MockCardRow {
  assetId: string;
  ownerPubkey: string;
  name: string;
  attributes: { trait_type: string; value: string }[];
  image: string | null;
}

interface DbRow {
  asset_id: string;
  owner_pubkey: string;
  name: string;
  attributes: { trait_type: string; value: string }[];
  image: string | null;
}

const toRow = (r: DbRow): MockCardRow => ({
  assetId: r.asset_id,
  ownerPubkey: r.owner_pubkey,
  name: r.name,
  attributes: Array.isArray(r.attributes) ? r.attributes : [],
  image: r.image,
});

export async function listByOwner(owner: string): Promise<MockCardRow[]> {
  const res = await query<DbRow>(
    'SELECT * FROM mock_cards WHERE owner_pubkey = $1 ORDER BY created_at',
    [owner],
  );
  return res.rows.map(toRow);
}

export async function getById(assetId: string): Promise<MockCardRow | null> {
  const res = await query<DbRow>('SELECT * FROM mock_cards WHERE asset_id = $1', [assetId]);
  return res.rows[0] ? toRow(res.rows[0]) : null;
}

export async function add(input: {
  ownerPubkey: string;
  name: string;
  attributes: { trait_type: string; value: string }[];
  image?: string | null;
  assetId?: string;
}): Promise<MockCardRow> {
  const assetId =
    input.assetId ??
    `custom_${Buffer.from(input.ownerPubkey, 'utf8').toString('hex')}_${Date.now()}`;
  await query(
    `INSERT INTO mock_cards (asset_id, owner_pubkey, name, attributes, image)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [assetId, input.ownerPubkey, input.name, JSON.stringify(input.attributes), input.image ?? null],
  );
  return (await getById(assetId))!;
}

export async function remove(assetId: string, owner: string): Promise<void> {
  await query('DELETE FROM mock_cards WHERE asset_id = $1 AND owner_pubkey = $2', [assetId, owner]);
}
