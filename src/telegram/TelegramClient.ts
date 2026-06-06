import axios from 'axios';
import { withRetry } from '../utils/retry';
import { logger } from '../utils/logger';

export interface ListingDetails {
  price?: string;
  street?: string;
  info1?: string;  // e.g. "דירה, חרוזים, רמת גן"
  info2?: string;  // e.g. "3 חדרים • קומה 2 • 100 מ״ר"
}

export async function sendNotification(
  source: string,
  url: string,
  details?: ListingDetails
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const chatId = process.env.TELEGRAM_CHAT_ID!;

  const lines: string[] = ['🏠 New Apartment Listing', '', `Source: ${source}`];

  if (details?.price)  lines.push(`💰 ${details.price}`);
  if (details?.street || details?.info1) {
    const location = [details.street, details.info1].filter(Boolean).join(' — ');
    lines.push(`📍 ${location}`);
  }
  if (details?.info2)  lines.push(`🛏 ${details.info2}`);

  lines.push('', `🔗 ${url}`);

  const text = lines.join('\n');

  await withRetry(
    async () => {
      await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text,
        disable_web_page_preview: false,
      });
    },
    3,
    1000,
    'telegram'
  );

  logger.info({ source, url, price: details?.price }, 'Notification sent');
}
