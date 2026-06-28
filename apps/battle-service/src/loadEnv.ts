import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Minimal, dependency-free `.env` loader for the battle-service. Next.js
 * auto-loads `apps/web/.env.local` for the web app, but this service is started
 * with plain `tsx` (no dotenv), so without this it only saw shell env — meaning
 * shared config like HELIUS_RPC_URL had to be re-exported on every start.
 *
 * Loads the repo-root `.env` if present. Existing process.env vars always win
 * (so an explicit shell export or real deployment env overrides the file).
 */
function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

export function loadRootEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url)); // apps/battle-service/src
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(here, '../../../.env'), // repo root from apps/battle-service/src
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const parsed = parseEnv(readFileSync(path, 'utf8'));
      for (const [k, v] of Object.entries(parsed)) {
        if (process.env[k] === undefined) process.env[k] = v;
      }
    } catch {
      /* unreadable .env — ignore, fall back to shell env */
    }
    return; // first existing file wins
  }
}

// Run on import. ESM evaluates imported modules in order, so a side-effect
// `import './loadEnv.js'` placed before any other import guarantees env is
// hydrated before those modules (e.g. server-kit) evaluate.
process.env.SERVICE_NAME ??= 'battle-service';
loadRootEnv();
