# Apartment Monitor

Self-hosted apartment listing monitor. Watches Facebook Groups and Yad2 every 5 minutes and sends Telegram notifications for new matching listings.

**No AI. No parsing. Just links.**

---

## How it works

1. Scans configured Facebook Groups and Yad2 search URLs
2. Filters Facebook posts by keywords (include / exclude)
3. Checks each listing URL against SQLite — skips duplicates
4. Sends a Telegram message containing only the source and link

---

## Prerequisites

- Node.js 22+
- Docker + Docker Compose (for production)
- A Telegram Bot token + chat ID

---

## Setup

### 1. Telegram Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts — copy the **bot token**
3. Start a conversation with your new bot (send any message)
4. Visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser
5. Find `"chat": { "id": ... }` — that number is your **chat ID**

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=987654321
```

### 3. Configure sources and filters

Edit `config.yaml`:

```yaml
facebook:
  enabled: true
  groups:
    - https://www.facebook.com/groups/123456789
    - https://www.facebook.com/groups/987654321

yad2:
  enabled: true
  search_urls:
    - https://www.yad2.co.il/realestate/rent?city=8600&rooms=2-4&price=2000-6000

filters:
  include_keywords:
    - ראשון לציון
    - ראשל"צ
    - רחובות
    - נס ציונה
    - דירה
    - להשכרה
  exclude_keywords:
    - רכב
    - עבודה
    - דרושים

scheduler:
  interval_minutes: 5
```

**Yad2 tip:** Open Yad2 in your browser, filter by city/rooms/price, then copy the full URL from the address bar.

### 4. Facebook login (one-time)

```bash
npm install
npm run facebook:login
```

A browser window opens. Log in to Facebook normally. When done, come back to the terminal and press **Enter**. The session is saved to `./data/browser-profile/` and reused on every subsequent run.

---

## Running locally

```bash
npm install
npm run dev
```

Check health:

```bash
curl http://localhost:3000/health
```

Trigger a manual scan:

```bash
curl -X POST http://localhost:3000/scan
```

---

## Running with Docker

**Important:** Complete the Facebook login step locally first so the session is saved to `./data/browser-profile/`.

```bash
docker compose up -d
```

View logs:

```bash
docker compose logs -f
```

Stop:

```bash
docker compose down
```

---

## Data persistence

| Path | Contents |
|------|----------|
| `./data/sqlite/` | SQLite database (seen listings) |
| `./data/browser-profile/` | Facebook browser session |
| `./data/logs/` | Reserved for log files |

---

## Notification format

```
🏠 New Apartment Listing

Source: Facebook

🔗 https://www.facebook.com/groups/123456/posts/789012
```

```
🏠 New Apartment Listing

Source: Yad2

🔗 https://www.yad2.co.il/item/abc123
```

---

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Returns `{"status":"ok"}` |
| POST | `/scan` | Triggers an immediate scan |

---

## Troubleshooting

**Facebook session expired**
```bash
npm run facebook:login
```

**No Yad2 listings found**
Open the search URL in a browser and verify it shows results. Yad2 may change its page structure — check that `a[href*="/item/"]` links are visible in the page source.

**Telegram messages not arriving**
- Verify `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `.env`
- Make sure you sent at least one message to the bot in Telegram first
- Test manually: `curl "https://api.telegram.org/bot<TOKEN>/getMe"`

**Docker: Facebook not working**
Run `npm run facebook:login` locally, then restart the container — the profile is mounted via the volume.

**Too many notifications on first run**
The first scan sends notifications for all currently visible listings. After that, duplicates are skipped. This is expected behavior.
