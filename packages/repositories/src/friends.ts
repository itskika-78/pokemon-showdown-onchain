import { query } from '@battler/server-kit';
import { ensureUser, type PublicUser } from './users.js';

export interface Friend extends PublicUser {
  addedAt: string;
}

/** Add a friend (one-directional follow). Idempotent. */
export async function addFriend(owner: string, friend: string): Promise<void> {
  if (owner === friend) return;
  await ensureUser(friend);
  await query(
    'INSERT INTO friends (owner_pubkey, friend_pubkey) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [owner, friend],
  );
}

export async function removeFriend(owner: string, friend: string): Promise<void> {
  await query('DELETE FROM friends WHERE owner_pubkey = $1 AND friend_pubkey = $2', [owner, friend]);
}

/** List a user's friends with their usernames + ratings (newest first). */
export async function listFriends(owner: string): Promise<Friend[]> {
  const res = await query<{ pubkey: string; username: string | null; rating: number; created_at: string }>(
    `SELECT f.friend_pubkey AS pubkey, u.username, COALESCE(u.rating, 1000) AS rating, f.created_at
       FROM friends f
       LEFT JOIN users u ON u.pubkey = f.friend_pubkey
       WHERE f.owner_pubkey = $1
       ORDER BY f.created_at DESC`,
    [owner],
  );
  return res.rows.map((r) => ({ pubkey: r.pubkey, username: r.username, rating: r.rating, addedAt: r.created_at }));
}

export async function isFriend(owner: string, friend: string): Promise<boolean> {
  const res = await query<{ owner_pubkey: string }>(
    'SELECT owner_pubkey FROM friends WHERE owner_pubkey = $1 AND friend_pubkey = $2',
    [owner, friend],
  );
  return res.rows.length > 0;
}
