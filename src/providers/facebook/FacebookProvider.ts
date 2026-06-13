import { chromium, Browser, BrowserContext } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { AppConfig, getDataDir } from '../../config/Config';
import { PropertyAd } from '../../models/PropertyAd';
import { processAd } from '../../matching/process';
import { extractPrice, extractRooms, extractSize } from '../../matching/features';
import { withRetry } from '../../utils/retry';
import { logger } from '../../utils/logger';

let browser: Browser | null = null;
let browserContext: BrowserContext | null = null;

function getCookiesPath(): string {
  return path.join(getDataDir(), 'facebook-cookies.json');
}

export async function getFacebookContext(): Promise<BrowserContext> {
  if (browserContext) return browserContext;

  const cookiesPath = getCookiesPath();

  if (!fs.existsSync(cookiesPath)) {
    throw new Error(
      `Facebook cookies not found at ${cookiesPath}. Run: npm run facebook:login`
    );
  }

  browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  browserContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  // Inject saved cookies — platform-independent JSON, works on any OS
  const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
  await browserContext.addCookies(cookies);

  logger.info({ cookiesPath }, 'Facebook cookies loaded');
  return browserContext;
}

export async function closeFacebookContext(): Promise<void> {
  if (browserContext) {
    await browserContext.close();
    browserContext = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
}

interface Post {
  id: string;
  url: string;
  text: string;
}

function extractIdFromUrl(url: string): string {
  const segments = url.replace(/\/$/, '').split('/');
  return segments[segments.length - 1];
}

/** Build a PropertyAd from a free-text Facebook post. Location matching relies
 *  on the scoring engine scanning rawText; price/rooms/size parsed for display. */
function postToAd(post: Post): PropertyAd {
  const firstLine = post.text.split('\n').map(s => s.trim()).filter(Boolean)[0] ?? 'Facebook post';
  return {
    source: 'facebook',
    externalId: post.id,
    url: post.url,
    title: firstLine.slice(0, 80),
    description: post.text,
    price: extractPrice(post.text) ?? undefined,
    rooms: extractRooms(post.text) ?? undefined,
    sizeSqm: extractSize(post.text) ?? undefined,
    collectedAt: new Date(),
    imageUrls: [],
    metadata: { rawText: post.text },
  };
}

async function scrapeGroupPage(
  context: BrowserContext,
  groupUrl: string,
  scrollCount: number
): Promise<Post[]> {
  const page = await context.newPage();

  try {
    const targetUrl = `${groupUrl}?sorting_setting=CHRONOLOGICAL`;
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('checkpoint')) {
      logger.error({ groupUrl }, 'Facebook session expired. Run: npm run facebook:login');
      return [];
    }

    try {
      await page.waitForSelector('[role="article"]', { timeout: 15000 });
    } catch {
      logger.warn({ groupUrl }, 'No articles found — group may be private or empty');
      return [];
    }

    // Deep scan uses longer waits to let Facebook load older posts
    const waitMs = scrollCount > 6 ? 2200 : 1800;

    for (let i = 0; i < scrollCount; i++) {
      await page.evaluate(() => window.scrollBy(0, 900));
      await page.waitForTimeout(waitMs);
    }

    // Expand truncated posts so keyword matching sees the full text
    await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>('[role="button"]'));
      for (const btn of candidates) {
        const text = btn.textContent?.trim() ?? '';
        if (
          text === 'ראה עוד' ||
          text === 'See more' ||
          text === 'קרא עוד' ||
          text === 'הצג עוד'
        ) {
          btn.click();
        }
      }
    });
    await page.waitForTimeout(1000);

    const raw = await page.evaluate((): Array<{ url: string; text: string }> => {
      const articles = Array.from(document.querySelectorAll('[role="article"]'));
      const results: Array<{ url: string; text: string }> = [];

      for (const article of articles) {
        // Try multiple link patterns Facebook uses
        const links = Array.from(
          article.querySelectorAll<HTMLAnchorElement>(
            'a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid"]'
          )
        );

        let url = '';
        for (const link of links) {
          const href = link.getAttribute('href') || '';
          if (href.includes('/posts/') || href.includes('/permalink/')) {
            const clean = href.split('?')[0];
            url = clean.startsWith('http') ? clean : `https://www.facebook.com${clean}`;
            break;
          }
          // story_fbid format: extract group post permalink
          if (href.includes('story_fbid')) {
            url = href.startsWith('http') ? href : `https://www.facebook.com${href}`;
            break;
          }
        }

        if (!url) continue;

        results.push({ url, text: article.textContent || '' });
      }

      return results;
    });

    const posts = raw
      .map(p => ({ id: extractIdFromUrl(p.url), url: p.url, text: p.text }))
      .filter(p => p.id !== 'fb_');

    logger.debug({ groupUrl, found: posts.length }, 'Raw posts extracted');
    return posts;
  } finally {
    await page.close();
  }
}

export async function scanFacebookGroups(config: AppConfig): Promise<void> {
  if (!config.facebook.enabled || !config.facebook.groups?.length) return;

  const scrollCount = 5;
  logger.info('Facebook scan started');

  const context = await getFacebookContext();
  let notified = 0, skipped = 0, rejected = 0;

  for (const groupUrl of config.facebook.groups) {
    logger.info({ groupUrl }, 'Scanning group');

    try {
      const posts = await withRetry(
        () => scrapeGroupPage(context, groupUrl, scrollCount),
        3,
        2000,
        `facebook:${groupUrl}`
      );

      for (const post of posts) {
        const outcome = await processAd(postToAd(post));
        if (outcome.notified) notified++;
        else if (outcome.skipped) skipped++;
        else rejected++;
      }

      logger.info({ groupUrl, scanned: posts.length }, 'Group scan complete');
    } catch (err) {
      logger.error({ groupUrl, err }, 'Failed to scan Facebook group');
    }
  }

  logger.info({ notified, skipped, rejected }, 'Facebook scan finished');
}
