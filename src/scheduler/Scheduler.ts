import cron from 'node-cron';
import { AppConfig } from '../config/Config';
import { scanFacebookGroups } from '../providers/facebook/FacebookProvider';
import { scanYad2 } from '../providers/yad2/Yad2Provider';
import { logger } from '../utils/logger';

let scanning = false;

export async function runScan(config: AppConfig): Promise<void> {
  if (scanning) {
    logger.warn('Scan already in progress, skipping');
    return;
  }

  scanning = true;
  const start = Date.now();
  logger.info('Scan started');

  try {
    await scanFacebookGroups(config);
    await scanYad2(config);
  } catch (err) {
    logger.error({ err }, 'Scan error');
  } finally {
    scanning = false;
  }

  logger.info({ durationMs: Date.now() - start }, 'Scan completed');
}

export function startScheduler(config: AppConfig): void {
  const minutes = config.scheduler?.interval_minutes ?? 5;
  const expression = `*/${minutes} * * * *`;

  logger.info({ intervalMinutes: minutes, expression }, 'Scheduler started');

  runScan(config).catch(err => logger.error({ err }, 'Initial scan failed'));

  cron.schedule(expression, () => {
    runScan(config).catch(err => logger.error({ err }, 'Scheduled scan failed'));
  });
}
