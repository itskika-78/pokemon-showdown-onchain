/**
 * Production security headers. The CSP is intentionally permissive on
 * script/style (Next's inline runtime + Solana wallet adapters need it) and on
 * connect/img (we talk to many RPC, Socket.IO, marketplace and sprite hosts) —
 * a CSP that breaks the app is worse than none — but it locks down the
 * high-value vectors: framing (clickjacking), object/embed, and base-uri.
 */
// Dev needs ws:/http: for the local Socket.IO + HMR connections; production
// locks connect-src to TLS only (RPC over https, battle-service over wss).
const isProd = process.env.NODE_ENV === 'production';
const connectSrc = isProd ? "'self' https: wss:" : "'self' https: wss: http: ws:";

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  `connect-src ${connectSrc}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // Our workspace packages ship TS source — Next must transpile them.
  transpilePackages: [
    '@battler/core',
    '@battler/card-parser',
    '@battler/das',
    '@battler/ingest',
    '@battler/repositories',
    '@battler/server-kit',
  ],
  experimental: {
    // Keep heavy / native server-only deps out of the bundle (required at runtime).
    serverComponentsExternalPackages: [
      'pg',
      'ioredis',
      'pino',
      'prom-client',
      '@pkmn/sim',
      '@pkmn/dex',
    ],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.helius-rpc.com' },
      { protocol: 'https', hostname: '**.phygitals.com' },
      { protocol: 'https', hostname: 'play.pokemonshowdown.com' },
      { protocol: 'https', hostname: 'images.pokemontcg.io' },
      { protocol: 'https', hostname: 'images.scrydex.com' },
    ],
  },
  // Our workspace packages are NodeNext TS source: they import siblings with a
  // `.js` extension (e.g. `export * from './config.js'`). tsx resolves that to
  // `.ts` automatically; webpack does not, so map `.js` requests to TS sources
  // first (falling back to real `.js`/`.jsx` for node_modules).
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
