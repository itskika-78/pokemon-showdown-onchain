import { z } from 'zod';
import { resolveHeliusRpcUrls } from './helius.js';

export { resolveHeliusRpcUrls, maskHeliusUrl } from './helius.js';

/**
 * Central, zod-validated server config. Parsed once and cached; throws on first
 * access if the environment is invalid (crash-fast). Client-side (NEXT_PUBLIC_*)
 * config lives in the web app, not here.
 */

const envBool = (def: boolean) =>
  z.preprocess((v) => {
    if (v === undefined || v === '') return def;
    if (typeof v === 'boolean') return v;
    return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
  }, z.boolean());

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string().default('postgres://battler:battler@localhost:5432/battler'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(8).default('dev-only-secret-change-me-please'),
  SIWS_DOMAIN: z.string().default('localhost:3000'),
  SIWS_STATEMENT: z.string().default('Sign in to PokéChain'),
  SIWS_URI: z.string().default('http://localhost:3000'),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),
  HELIUS_RPC_URL: z.string().optional(),
  HELIUS_DEVNET_RPC_URL: z.string().optional(),
  HELIUS_API_KEY: z.string().optional(),
  USE_MOCK_DAS: envBool(false),
  PHYGITALS_COLLECTION_MINTS: z.string().default('BSG6DyEihFFtfvxtL9mKYsvTwiZXB1rq5gARMTJC2xAM'),
  PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(10_000).default(250),
  BATTLE_FORMAT: z.string().default('gen9customgame'),
  DERIVATION_VERSION: z.coerce.number().int().positive().default(2),
  BATTLE_SERVICE_PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  LOG_SIGNING_PRIVATE_KEY: z.string().optional(),
  LOG_SIGNING_SECRET: z.string().default('dev-only-log-signing-secret'),
  TURN_TIMER_SECONDS: z.coerce.number().int().positive().default(60),
  RECONNECT_WINDOW_SECONDS: z.coerce.number().int().positive().default(30),
  // Treasury wallet that receives on-chain platform payments (fees, rake).
  TREASURY_WALLET: z.string().optional(),
  // Magic Eden API key — enables real in-app buy (builds the buy transaction).
  MAGICEDEN_API_KEY: z.string().optional(),
  // Shared secret to authenticate inbound Helius webhook calls (Authorization header).
  HELIUS_WEBHOOK_SECRET: z.string().optional(),
});

export interface ServerConfig {
  nodeEnv: string;
  isProd: boolean;
  databaseUrl: string;
  redisUrl: string;
  jwtSecret: string;
  siws: { domain: string; statement: string; uri: string; version: string; chainId: string };
  sessionTtlSeconds: number;
  heliusRpcUrl?: string;
  heliusDevnetRpcUrl?: string;
  heliusApiKey?: string;
  useMockDas: boolean;
  supportedCollections: Set<string>;
  platformFeeBps: number;
  battleFormat: string;
  derivationVersion: number;
  battlePort: number;
  webOrigin: string;
  logSigning: { privateKeyPem?: string; secret: string };
  turnTimerSeconds: number;
  reconnectWindowSeconds: number;
  treasuryWallet?: string;
  magicEdenApiKey?: string;
  heliusWebhookSecret?: string;
}

let cached: ServerConfig | undefined;

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  if (cached) return cached;

  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid server environment: ${issues}`);
  }
  const e = parsed.data;
  const isProd = e.NODE_ENV === 'production';

  if (isProd && e.JWT_SECRET === 'dev-only-secret-change-me-please') {
    throw new Error('JWT_SECRET must be set to a strong secret in production');
  }

  if (isProd && e.LOG_SIGNING_SECRET === 'dev-only-log-signing-secret') {
    throw new Error('LOG_SIGNING_SECRET must be set to a strong secret in production');
  }

  const heliusResolved = resolveHeliusRpcUrls({
    apiKey: e.HELIUS_API_KEY,
    mainnetUrl: e.HELIUS_RPC_URL,
    devnetUrl: e.HELIUS_DEVNET_RPC_URL,
  });

  if (isProd && (!heliusResolved.mainnet || !heliusResolved.devnet)) {
    throw new Error(
      'Production requires HELIUS_API_KEY or both HELIUS_RPC_URL and HELIUS_DEVNET_RPC_URL (server-side only)',
    );
  }

  if (isProd && !e.TREASURY_WALLET) {
    throw new Error('TREASURY_WALLET must be set in production');
  }

  const supportedCollections = new Set(
    (e.PHYGITALS_COLLECTION_MINTS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

  cached = {
    nodeEnv: e.NODE_ENV,
    isProd,
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL,
    jwtSecret: e.JWT_SECRET,
    siws: {
      domain: e.SIWS_DOMAIN,
      statement: e.SIWS_STATEMENT,
      uri: e.SIWS_URI,
      version: '1',
      chainId: 'solana:mainnet',
    },
    sessionTtlSeconds: e.SESSION_TTL_SECONDS,
    heliusRpcUrl: heliusResolved.mainnet,
    heliusDevnetRpcUrl: heliusResolved.devnet,
    heliusApiKey: e.HELIUS_API_KEY,
    useMockDas: e.USE_MOCK_DAS,
    supportedCollections,
    platformFeeBps: e.PLATFORM_FEE_BPS,
    battleFormat: e.BATTLE_FORMAT,
    derivationVersion: e.DERIVATION_VERSION,
    battlePort: e.BATTLE_SERVICE_PORT,
    webOrigin: e.WEB_ORIGIN,
    logSigning: { privateKeyPem: e.LOG_SIGNING_PRIVATE_KEY, secret: e.LOG_SIGNING_SECRET },
    turnTimerSeconds: e.TURN_TIMER_SECONDS,
    reconnectWindowSeconds: e.RECONNECT_WINDOW_SECONDS,
    treasuryWallet: e.TREASURY_WALLET,
    magicEdenApiKey: e.MAGICEDEN_API_KEY,
    heliusWebhookSecret: e.HELIUS_WEBHOOK_SECRET,
  };
  return cached;
}

/** Test helper: clear the cache so a fresh env can be loaded. */
export function _resetConfigForTests(): void {
  cached = undefined;
}
