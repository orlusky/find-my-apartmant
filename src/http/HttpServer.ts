import express from 'express';
import { AppConfig } from '../config/Config';
import { runScan } from '../scheduler/Scheduler';
import { logger } from '../utils/logger';

export function startHttpServer(config: AppConfig): void {
  const app = express();
  const port = parseInt(process.env.PORT || '3000', 10);

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/scan', (_req, res) => {
    res.json({ status: 'ok', message: 'Scan triggered' });
    runScan(config).catch(err => logger.error({ err }, 'Manual scan failed'));
  });

  app.listen(port, () => {
    logger.info({ port }, 'HTTP server started');
  });
}
