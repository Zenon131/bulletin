# Bulletin Content Seeding

## 🔔 Philly Real-Content Seeder (Recommended)

Fetches actual Philadelphia news/events from RSS feeds and seeds them as realistic discussion posts. Best for a Philly-only launch.

```bash
# Preview what would be created
node scripts/seed-philly.mjs --posts 200

# Clean old data and insert 200 real Philly posts
node scripts/seed-philly.mjs --go --clean --posts 200

# Just insert (keep existing data)
node scripts/seed-philly.mjs --go --posts 200
```

**What it does:**
1. Fetches current articles from [Billy Penn](https://billypenn.com) RSS feed
2. Maps articles to Philly geotopics (Food, Events, Music, Politics, etc.)
3. Generates discussion prompts like "Anyone else hear about...?" or "Just saw this:"
4. Backdates posts over the last 30 days for an organic feel

---

## Synthetic Multi-City Seeder

For testing with fake content across 19 cities:

```bash
# Preview what would be created (dry-run — no DB writes)
node scripts/seed-posts.mjs --posts 1000

# Actually insert 10,000 posts immediately
node scripts/seed-posts.mjs --go --posts 10000

# Drip 50,000 posts over 5 days (feels organic)
node scripts/seed-posts.mjs --go --posts 50000 --drip-days 5

# Skip OpenRouter entirely — 100% free synthetic posts
node scripts/seed-posts.mjs --go --posts 50000 --skip-llm
```

## How It Works

The seeder creates **realistic, varied content** by combining:

1. **456 geotopics** across 24 topics × 19 cities
2. **Post templates** — a mix of:
   - **LLM-generated** (via OpenRouter, ~72 calls total for 50k posts)
   - **Synthetic** (programmatically combined openers/closers/venues/sentiment — free)
3. **Remixing** — each template is lightly varied (emoji, punctuation, synonym swap) so no two posts are identical
4. **Backdated timestamps** — posts are spread across the last 90 days
5. **Votes** — 0–8 random up/down votes per post, creating realistic leaderboard scores

## Cost

| Approach | Est. Cost | Quality |
|----------|-----------|---------|
| `--skip-llm` (synthetic only) | **$0** | Good |
| Default (LLM + synthetic blend) | **~$1–3** for 50k posts | Very realistic |

Uses `google/gemini-2.5-flash-lite-preview-09-2025` by default (~$0.10/1M tokens). Override with `--model`.

## Strategies for 50k Posts

### Strategy A: Immediate Bulk (testing / staging)
```bash
node scripts/seed-posts.mjs --go --posts 50000 --skip-llm
```
- ~2–3 minutes to insert
- Best for load testing, screenshot demos, QA

### Strategy B: Gradual Drip (production "Reddit strategy")
```bash
node scripts/seed-posts.mjs --go --posts 50000 --drip-days 7
```
- Posts trickle in over 7 days while you soft-launch
- Looks organic to early users
- Leave a terminal / screen session running, or schedule via cron

### Strategy C: LLM-Enhanced Realism
```bash
node scripts/seed-posts.mjs --go --posts 50000
```
- ~72 OpenRouter calls generate city-specific templates
- Posts mention real neighborhoods, local slang, specific venues
- Most realistic for investor demos / user interviews

## CLI Reference

| Flag | Default | Description |
|------|---------|-------------|
| `--go` | off | Actually write to Supabase (without this = dry-run) |
| `--posts` | 50000 | Total posts to generate |
| `--drip-days` | 0 | Spread insertion over N days (0 = immediate) |
| `--skip-llm` | off | Use only synthetic templates (free) |
| `--model` | `google/gemini-2.5-flash-lite-preview-09-2025` | OpenRouter model slug |
| `--batch` | 1000 | Supabase insert batch size |

## Cleaning Up

To wipe all seeded data and start over:

```bash
# Run the cleanup SQL in Supabase SQL Editor
-- scripts/supabase-cleanup.sql
```

Or manually delete seed-device posts only (keeps real user data):

```sql
DELETE FROM votes WHERE device_id LIKE 'seed_device_%';
DELETE FROM engrams WHERE device_id LIKE 'seed_device_%';
UPDATE geotopics SET post_count = 0 WHERE post_count > 0;
```

## Customizing Content

Edit these arrays in `scripts/seed-posts.mjs`:

- **`CITIES`** — add/remove locations
- **`TOPICS`** — add/remove verticals
- **`VENUE_PATTERNS`** — topic-specific venue names for synthetic posts
- **`OPENERS` / `CLOSERS` / `EMOTIONS`** — sentence frames
- **`SENTIMENT_ADJ`** — adjective pools

No rebuild needed — the script reads them at runtime.
