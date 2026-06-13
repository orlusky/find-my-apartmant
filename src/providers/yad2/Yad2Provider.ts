import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, BrowserContext } from 'playwright';
import { AppConfig } from '../../config/Config';
import { PropertyAd } from '../../models/PropertyAd';
import { processAd } from '../../matching/process';
import { extractPrice, extractRooms, extractSize } from '../../matching/features';
import { withRetry } from '../../utils/retry';
import { logger } from '../../utils/logger';

chromium.use(StealthPlugin());

interface RawListing {
  url: string;
  price: string;
  street: string;
  info1: string;   // "דירה, חרוזים, רמת גן"
  info2: string;   // "3 חדרים • קומה 2 • 100 מ״ר"
  image: string;
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
    extraHTTPHeaders: { 'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7' },
  });

  return { browser, context };
}

function extractId(url: string): string {
  const segments = url.replace(/\/$/, '').split('/');
  return segments[segments.length - 1];
}

/** Parse "דירה, חרוזים, רמת גן" → { propertyType, neighborhood, city }. */
function parseInfo1(info1: string): { propertyType?: string; neighborhood?: string; city?: string } {
  const parts = info1.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 3) return { propertyType: parts[0], neighborhood: parts[1], city: parts[2] };
  if (parts.length === 2) return { propertyType: parts[0], city: parts[1] };
  return { city: parts[0] };
}

function toAd(raw: RawListing): PropertyAd {
  const { propertyType, neighborhood, city } = parseInfo1(raw.info1);
  // Yad2 listings come from the /rent/ section, so they are inherently rentals.
  // The card text never says "להשכרה", so we add it to satisfy rental-intent
  // gates (required_any) that exist mainly to filter Facebook's mixed content.
  const combined = `${raw.street} ${raw.info1} ${raw.info2} ${raw.price} להשכרה`;
  return {
    source: 'yad2',
    externalId: extractId(raw.url),
    url: raw.url,
    title: raw.street || raw.info1 || 'Yad2 listing',
    description: `${raw.info1} ${raw.info2}`.trim(),
    city,
    neighborhood,
    street: raw.street || undefined,
    price: extractPrice(raw.price) ?? extractPrice(combined) ?? undefined,
    rooms: extractRooms(raw.info2) ?? undefined,
    sizeSqm: extractSize(raw.info2) ?? undefined,
    propertyType,
    collectedAt: new Date(),
    imageUrls: raw.image ? [raw.image] : [],
    metadata: { rawText: combined },
  };
}

async function scrapeSearchPage(context: BrowserContext, searchUrl: string): Promise<RawListing[]> {
  const page = await context.newPage();
  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try {
      await page.click('[data-testid="close-button"], button[aria-label="סגור"]', { timeout: 3000 });
    } catch { /* no dialog */ }

    await page.waitForTimeout(4000);
    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(2000);

    return page.evaluate((): RawListing[] => {
      const seen = new Set<string>();
      const results: RawListing[] = [];
      for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/item/"]'))) {
        const href = link.getAttribute('href') || '';
        const clean = href.split('?')[0];
        const url = clean.startsWith('http') ? clean : `https://www.yad2.co.il${clean}`;
        if (!url.includes('/item/') || seen.has(url)) continue;
        seen.add(url);

        results.push({
          url,
          price:  link.querySelector('[data-testid="price"]')?.textContent?.trim() ?? '',
          street: link.querySelector('[data-testid="street-name"]')?.textContent?.trim() ?? '',
          info1:  link.querySelector('[data-testid="item-info-line-1st"]')?.textContent?.trim() ?? '',
          info2:  link.querySelector('[data-testid="item-info-line-2nd"]')?.textContent?.trim() ?? '',
          image:  link.querySelector<HTMLImageElement>('img[data-testid="image"]')?.src ?? '',
        });
      }
      return results;
    });
  } finally {
    await page.close();
  }
}

export async function scanYad2(config: AppConfig): Promise<void> {
  if (!config.yad2.enabled || !config.yad2.search_urls?.length) return;

  logger.info('Yad2 scan started');
  const { browser, context } = await buildBrowserContext();
  let notified = 0, skipped = 0, rejected = 0;

  try {
    for (const searchUrl of config.yad2.search_urls) {
      logger.info({ searchUrl }, 'Scanning Yad2 URL');
      try {
        const raws = await withRetry(() => scrapeSearchPage(context, searchUrl), 3, 2000, `yad2:${searchUrl}`);
        for (const raw of raws) {
          const outcome = await processAd(toAd(raw));
          if (outcome.notified) notified++;
          else if (outcome.skipped) skipped++;
          else rejected++;
        }
        logger.info({ searchUrl, found: raws.length }, 'Yad2 page scan complete');
      } catch (err) {
        logger.error({ searchUrl, err }, 'Failed to scan Yad2 URL');
      }
    }
  } finally {
    await browser.close();
  }

  logger.info({ notified, skipped, rejected }, 'Yad2 scan finished');
}
