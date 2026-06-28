import './loadEnv.js'; // MUST be first: sets SERVICE_NAME + hydrates repo-root .env before any other module evaluates

import { loadServerConfig, logger } from '@battler/server-kit';
import { createServer } from './server.js';

async function main() {
  const cfg = loadServerConfig(); // crash-fast on bad env
  const { httpServer } = await createServer();
  httpServer.listen(cfg.battlePort, () => {
    logger.info({ port: cfg.battlePort, format: cfg.battleFormat }, 'battle-service listening');
  });
}

main().catch((err) => {
  logger.error({ err }, 'battle-service failed to start');
  process.exit(1);
});
