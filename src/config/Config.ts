import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  facebook: {
    enabled: boolean;
    groups: string[];
  };
  yad2: {
    enabled: boolean;
    search_urls: string[];
  };
  filters: {
    include_groups: string[][];
    exclude_keywords: string[];
    price?: {
      min?: number;
      max?: number;
    };
  };
  scheduler: {
    interval_minutes: number;
  };
}

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;

  const configPath = path.join(process.cwd(), 'config.yaml');

  if (!fs.existsSync(configPath)) {
    throw new Error(`config.yaml not found at ${configPath}`);
  }

  cached = yaml.load(fs.readFileSync(configPath, 'utf8')) as AppConfig;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || token.trim() === '') {
    throw new Error('TELEGRAM_BOT_TOKEN is not set in .env');
  }
  if (!chatId || chatId.trim() === '') {
    throw new Error('TELEGRAM_CHAT_ID is not set in .env');
  }

  return cached;
}

export function getDataDir(): string {
  return process.env.DATA_DIR || './data';
}
