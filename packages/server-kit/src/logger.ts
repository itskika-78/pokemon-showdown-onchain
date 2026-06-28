import { pino } from 'pino';

/** Structured JSON logger. Every request, match event, settlement, and
 *  anti-cheat flag goes through this. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: process.env.SERVICE_NAME ?? 'battler' },
});

export type Logger = typeof logger;
