import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';
import * as dotenv from 'dotenv';

dotenv.config();

const dataDir = process.env.DATA_DIR || './data';
const profileDir = path.join(dataDir, 'browser-profile');
const cookiesPath = path.join(dataDir, 'facebook-cookies.json');

fs.mkdirSync(profileDir, { recursive: true });

async function main(): Promise<void> {
  console.log('──────────────────────────────────────────');
  console.log('  Facebook Login — Apartment Monitor');
  console.log('──────────────────────────────────────────');
  console.log('');

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    args: ['--no-sandbox'],
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();
  await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded' });

  console.log('✓ Browser opened.');
  console.log('');
  console.log('1. Log in to Facebook in the browser window.');
  console.log('2. Wait until you see your feed fully loaded.');
  console.log('3. Come back here and press Enter.');
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>(resolve => {
    rl.question('Press Enter when logged in: ', () => { rl.close(); resolve(); });
  });

  // Export all Facebook cookies to a portable JSON file
  const cookies = await context.cookies([
    'https://www.facebook.com',
    'https://facebook.com',
  ]);

  fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
  await context.close();

  const expiry = cookies
    .filter(c => c.expires && c.expires > 0)
    .map(c => new Date(c.expires * 1000))
    .sort((a, b) => a.getTime() - b.getTime())
    .pop();

  console.log('');
  console.log('✓ Cookies saved to:', cookiesPath);
  if (expiry) {
    console.log(`✓ Session valid until approximately: ${expiry.toLocaleDateString()}`);
  }
  console.log('');
  console.log('Now restart Docker:');
  console.log('  docker compose down && docker compose up -d');
}

main().catch(err => {
  console.error('Login error:', err);
  process.exit(1);
});
