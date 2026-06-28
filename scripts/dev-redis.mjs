/**
 * Dev-only: start the bundled Windows Redis server from .runtime/redis.
 *   node scripts/dev-redis.mjs
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const redisDir = path.join(root, '.runtime', 'redis');
const server = path.join(redisDir, 'redis-server.exe');
const conf = path.join(redisDir, 'redis.windows.conf');

const child = spawn(server, [conf], { cwd: redisDir, stdio: 'inherit' });

const shutdown = () => {
  try { child.kill(); } catch {}
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

child.on('exit', (code) => process.exit(code ?? 0));

console.log('[redis] starting on redis://localhost:6379');
