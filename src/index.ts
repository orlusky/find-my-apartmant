import { loadConfig } from './config/Config';
import { initDb } from './database/Database';
import { startHttpServer } from './http/HttpServer';
import { startScheduler } from './scheduler/Scheduler';
import { closeFacebookContext } from './providers/facebook/FacebookProvider';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  logger.info('Apartment monitor starting');

  const config = loadConfig();
  initDb();
  startHttpServer(config);
  startScheduler(config);

  logger.info('Apartment monitor running');
}

async function shutdown(): Promise<void> {
  logger.info('Shutting down gracefully');
  await closeFacebookContext();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

main().catch(err => {
  logger.fatal({ err }, 'Fatal startup error');
  process.exit(1);
});
