import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, BrowserContext } from 'playwright';
import { AppConfig } from '../../config/Config';
import { hasNotification, saveNotification } from '../../database/Database';
import { sendNotification, ListingDetails } from '../../telegram/TelegramClient';
import { withRetry } from '../../utils/retry';
import { logger } from '../../utils/logger';

chromium.use(StealthPlugin());

interface Listing {
  id: string;
  url: string;
  details: ListingDetails;
}

async function buildBrowserContext(): Promise<{ browser: Browser; context: BrowserContext }> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  }) as unknown as Browser;

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'he-IL',
    extraHTTPHeaders: {
      'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });

  return { browser, context };
}

function extractId(url: string): string {
  const segments = url.replace(/\/$/, '').split('/');
  return `yad2_${segments[segments.length - 1]}`;
}

async function scrapeSearchPage(context: BrowserContext, searchUrl: string): Promise<Listing[]> {
  const page = await context.newPage();

  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    try {
      await page.click('[data-testid="close-button"], button[aria-label="סגור"]', { timeout: 3000 });
    } catch { /* no dialog */ }

    await page.waitForTimeout(4000);
    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(2000);

    const raw = await page.evaluate((): Array<{
      url: string;
      price: string;
      street: string;
      info1: string;
      info2: string;
    }> => {
      const seen = new Set<string>();
      const results = [];

      for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/item/"]'))) {
        const href = link.getAttribute('href') || '';
        const clean = href.split('?')[0];
        const url = clean.startsWith('http') ? clean : `https://www.yad2.co.il${clean}`;

        if (!url.includes('/item/') || seen.has(url)) continue;
        seen.add(url);

        const price  = link.querySelector('[data-testid="price"]')?.textContent?.trim() ?? '';
        const street = link.querySelector('[data-testid="street-name"]')?.textContent?.trim() ?? '';
        const info1  = link.querySelector('[data-testid="item-info-line-1st"]')?.textContent?.trim() ?? '';
        const info2  = link.querySelector('[data-testid="item-info-line-2nd"]')?.textContent?.trim() ?? '';

        results.push({ url, price, street, info1, info2 });
      }

      return results;
    });

    return raw.map(r => ({
      id: extractId(r.url),
      url: r.url,
      details: {
        price:  r.price  || undefined,
        street: r.street || undefined,
        info1:  r.info1  || undefined,
        info2:  r.info2  || undefined,
      },
    }));
  } finally {
    await page.close();
  }
}

export async function scanYad2(config: AppConfig): Promise<void> {
  if (!config.yad2.enabled || !config.yad2.search_urls?.length) return;

  logger.info('Yad2 scan started');

  const { browser, context } = await buildBrowserContext();
  let totalNew = 0;
  let totalSkipped = 0;

  try {
    for (const searchUrl of config.yad2.search_urls) {
      logger.info({ searchUrl }, 'Scanning Yad2 URL');

      try {
        const listings = await withRetry(
          () => scrapeSearchPage(context, searchUrl),
          3,
          2000,
          `yad2:${searchUrl}`
        );

        let pageNew = 0;

        for (const listing of listings) {
          if (hasNotification(listing.id)) {
            totalSkipped++;
            continue;
          }

          await sendNotification('Yad2', listing.url, listing.details);
          saveNotification(listing.id, 'Yad2', listing.url);
          pageNew++;
          totalNew++;
        }

        logger.info({ searchUrl, found: listings.length, sent: pageNew }, 'Yad2 page scan complete');
      } catch (err) {
        logger.error({ searchUrl, err }, 'Failed to scan Yad2 URL');
      }
    }
  } finally {
    await browser.close();
  }

  logger.info({ totalNew, totalSkipped }, 'Yad2 scan finished');
}
