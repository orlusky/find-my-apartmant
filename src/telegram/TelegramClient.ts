import axios from 'axios';
import { withRetry } from '../utils/retry';
import { logger } from '../utils/logger';
import { PropertyAd } from '../models/PropertyAd';
import { MatchResult } from '../matching/ScoringEngine';

const TELEGRAM_API = 'https://api.telegram.org';

function timeAgo(date?: Date): string | null {
  if (!date) return null;
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const SOURCE_LABEL: Record<string, string> = { yad2: 'Yad2', facebook: 'Facebook' };

/** Build the rich notification body from a scored ad. */
export function formatMessage(
  ad: PropertyAd,
  match: MatchResult,
  kind: 'new' | 'update',
  previousPrice?: number
): string {
  const shown = Math.min(100, match.score);
  const header = kind === 'update'
    ? `🔻 Price drop — Score: ${shown}/100`
    : `🏠 New matching apartment — Score: ${shown}/100`;

  const location = [ad.neighborhood, ad.city].filter(Boolean).join(', ');
  const lines: string[] = [header, ''];

  if (location) lines.push(`📍 ${ad.street ? ad.street + ', ' : ''}${location}`);
  if (ad.price != null) {
    lines.push(kind === 'update' && previousPrice
      ? `💰 ₪${ad.price.toLocaleString()}  (was ₪${previousPrice.toLocaleString()})`
      : `💰 ₪${ad.price.toLocaleString()}`);
  }
  if (ad.rooms != null) lines.push(`🛏 ${ad.rooms} rooms`);
  if (ad.sizeSqm != null) lines.push(`📐 ${ad.sizeSqm} m²`);

  if (match.reasons.length) {
    lines.push('', 'Why it matched:');
    for (const r of match.reasons) lines.push(`✅ ${r}`);
  }

  lines.push('', `Source: ${SOURCE_LABEL[ad.source] ?? ad.source}`);
  const ago = timeAgo(ad.publishedAt);
  if (ago) lines.push(`Published: ${ago}`);
  lines.push('', `🔗 ${ad.url}`);

  return lines.join('\n');
}

async function call(method: string, payload: Record<string, unknown>): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  await withRetry(
    async () => { await axios.post(`${TELEGRAM_API}/bot${token}/${method}`, payload, { timeout: 15000 }); },
    3, 1000, `telegram:${method}`
  );
}

/** Send a scored ad. Uses a photo message when an image is available. */
export async function sendAd(
  ad: PropertyAd,
  match: MatchResult,
  kind: 'new' | 'update',
  previousPrice?: number
): Promise<void> {
  const chatId = process.env.TELEGRAM_CHAT_ID!;
  const text = formatMessage(ad, match, kind, previousPrice);
  const image = ad.imageUrls[0];

  try {
    if (image) {
      await call('sendPhoto', { chat_id: chatId, photo: image, caption: text });
    } else {
      await call('sendMessage', { chat_id: chatId, text, disable_web_page_preview: false });
    }
  } catch (err) {
    // Photo URLs can rot / be blocked — fall back to a plain text message.
    logger.warn({ err: (err as Error).message }, 'Photo send failed, falling back to text');
    await call('sendMessage', { chat_id: chatId, text, disable_web_page_preview: false });
  }

  logger.info({ source: ad.source, url: ad.url, score: match.score, kind }, 'Notification sent');
}

/** Legacy plain notification (kept for any old call sites). */
export async function sendNotification(source: string, url: string): Promise<void> {
  await call('sendMessage', {
    chat_id: process.env.TELEGRAM_CHAT_ID!,
    text: `🏠 New Apartment Listing\n\nSource: ${source}\n\n🔗 ${url}`,
  });
  logger.info({ source, url }, 'Notification sent (legacy)');
}
