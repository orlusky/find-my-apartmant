import { PropertyAd } from '../models/PropertyAd';
import { getProfiles } from '../config/Config';
import { scoreAd, MatchResult } from './ScoringEngine';
import { classifyAd, upsertAd } from '../database/Database';
import { sendAd } from '../telegram/TelegramClient';
import { logger } from '../utils/logger';

export interface ProcessOutcome {
  notified: boolean;
  skipped: boolean;
  rejected: boolean;
}

/**
 * Run an ad through every enabled profile, pick the best-scoring match, then
 * apply dedup / update logic and notify. Single funnel for all providers.
 */
export async function processAd(ad: PropertyAd): Promise<ProcessOutcome> {
  let best: { match: MatchResult; profile: string } | null = null;

  for (const profile of getProfiles()) {
    const match = scoreAd(ad, profile);
    if (match.matched && (!best || match.score > best.match.score)) {
      best = { match, profile: profile.name };
    }
  }

  if (!best) {
    logger.debug({ url: ad.url }, 'Ad did not match any profile');
    return { notified: false, skipped: false, rejected: true };
  }

  const decision = classifyAd(ad);
  if (decision.kind === 'skip') {
    return { notified: false, skipped: true, rejected: false };
  }

  await sendAd(ad, best.match, decision.kind, decision.previousPrice);
  upsertAd(ad, best.match.score, best.profile);
  logger.info(
    { url: ad.url, score: best.match.score, profile: best.profile, kind: decision.kind },
    'Ad matched and notified'
  );
  return { notified: true, skipped: false, rejected: false };
}
