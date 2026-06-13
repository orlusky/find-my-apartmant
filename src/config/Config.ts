import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { SearchProfile } from '../matching/ScoringEngine';

dotenv.config();

/** Legacy filter block — still supported; auto-converted into a SearchProfile. */
interface LegacyFilters {
  include_groups?: string[][];
  exclude_keywords?: string[];
  price?: { min?: number; max?: number };
}

export interface AppConfig {
  facebook: { enabled: boolean; groups: string[] };
  yad2: { enabled: boolean; search_urls: string[] };
  filters?: LegacyFilters;
  profiles?: SearchProfile[];
  scheduler: { interval_minutes: number };
}

interface RawConfig extends AppConfig {}

let cached: { config: AppConfig; profiles: SearchProfile[] } | null = null;

/**
 * Convert the legacy `filters` block into a single SearchProfile so existing
 * configs keep working without edits. include_groups[0] = locations,
 * include_groups[1..] = required keyword groups (flattened to required terms is
 * too strict, so we treat group 0 as locations and the rest as preferred).
 */
function legacyToProfile(filters: LegacyFilters): SearchProfile {
  const groups = filters.include_groups ?? [];
  const [locationGroup, ...rest] = groups;
  return {
    name: 'legacy',
    enabled: true,
    locations: { neighborhoods: locationGroup ?? [] },
    preferred_keywords: rest.flat(),
    exclude_keywords: filters.exclude_keywords ?? [],
    price: { minimum: filters.price?.min, maximum: filters.price?.max },
    // Legacy behavior was "any location keyword + price" → keep a low bar.
    threshold: 25,
  };
}

export function loadConfig(): AppConfig {
  return load().config;
}

export function getProfiles(): SearchProfile[] {
  return load().profiles.filter(p => p.enabled);
}

function load(): { config: AppConfig; profiles: SearchProfile[] } {
  if (cached) return cached;

  const configPath = path.join(process.cwd(), 'config.yaml');
  if (!fs.existsSync(configPath)) {
    throw new Error(`config.yaml not found at ${configPath}`);
  }

  const config = yaml.load(fs.readFileSync(configPath, 'utf8')) as RawConfig;

  if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) throw new Error('TELEGRAM_BOT_TOKEN is not set in .env');
  if (!process.env.TELEGRAM_CHAT_ID?.trim()) throw new Error('TELEGRAM_CHAT_ID is not set in .env');

  let profiles: SearchProfile[] = config.profiles ?? [];
  if (!profiles.length && config.filters) {
    profiles = [legacyToProfile(config.filters)];
  }
  if (!profiles.length) {
    throw new Error('No search profiles found: define `profiles:` or `filters:` in config.yaml');
  }

  cached = { config, profiles };
  return cached;
}

export function getDataDir(): string {
  return process.env.DATA_DIR || './data';
}
