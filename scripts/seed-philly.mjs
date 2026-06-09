#!/usr/bin/env node
/**
 * Philly Content Seeder — "Real Web Scraping Strategy"
 *
 * Fetches actual Philadelphia news/events from RSS feeds and seeds
 * them into Supabase as realistic posts. Designed for a Philly-only
 * launch with real, current content.
 *
 * Usage:
 *   node scripts/seed-philly.mjs --go           # actually insert
 *   node scripts/seed-philly.mjs                 # dry-run preview
 *   node scripts/seed-philly.mjs --go --posts 500
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── CLI args ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const GO = args.includes('--go');
const TARGET_POSTS = Number(parseArg('--posts') ?? 200);
const CLEAN_SLATE = args.includes('--clean');
const BATCH_SIZE = 500;

function parseArg(flag) {
	const i = args.indexOf(flag);
	return i !== -1 ? args[i + 1] : undefined;
}

// ── Env setup ──────────────────────────────────────────────────────
function loadEnv() {
	try {
		const envPath = resolve(process.cwd(), '.env');
		const raw = readFileSync(envPath, 'utf-8');
		for (const line of raw.split('\n')) {
			const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
			if (m && !process.env[m[1]]) {
				let val = m[2].trim();
				if (
					(val.startsWith('"') && val.endsWith('"')) ||
					(val.startsWith("'") && val.endsWith("'"))
				) {
					val = val.slice(1, -1);
				}
				process.env[m[1]] = val;
			}
		}
	} catch {
		/* no .env file */
	}
}
loadEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
	console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_KEY. Set them in .env or environment.');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Content filter (inline) ──────────────────────────────────────
const BLOCKED_WORDS = [
	'\\bnigger\\b', '\\bnigga\\b', '\\bfag\\b', '\\bfaggot\\b',
	'\\bretard\\b', '\\bcunt\\b', '\\bchink\\b', '\\bkike\\b',
	'\\bspic\\b', '\\bcoon\\b', '\\bdyke\\b', '\\btranny\\b',
	'\\brapist\\b', '\\bpedo\\b', '\\bkys\\b'
].map((p) => new RegExp(p, 'gi'));

function isClean(text) {
	return !BLOCKED_WORDS.some((p) => p.test(text.toLowerCase()));
}

// ── Philly-only topics ───────────────────────────────────────────
const TOPICS = [
	'Food', 'Events', 'Music', 'Art', 'Housing', 'Politics',
	'Transportation', 'Education', 'Pets', 'Sports', 'Fitness',
	'Shopping', 'Nightlife', 'Museums', 'Parks', 'Community'
];

function buildGeotopics() {
	return TOPICS.map((topic) => {
		const name = `${topic} in Philadelphia`;
		return {
			name,
			slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
			description: `Community for ${topic.toLowerCase()} in Philadelphia`,
			location_name: 'Philadelphia',
			topic,
			created_by: 'ai',
			status: 'active',
			post_count: 0,
			weekly_score: 0
		};
	});
}

// ── RSS Sources ────────────────────────────────────────────────────
const RSS_SOURCES = [
	{
		url: 'https://billypenn.com/feed/',
		name: 'Billy Penn',
		parser: 'wordpress'
	},
	{
		url: 'https://www.visitphilly.com/feed/',
		name: 'Visit Philly',
		parser: 'wordpress'
	}
];

// ── Fetch & Parse RSS ────────────────────────────────────────────
async function fetchRSS(source) {
	try {
		const res = await fetch(source.url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (compatible; EngramBot/1.0)'
			}
		});
		if (!res.ok) {
			console.warn(`   ⚠️  ${source.name}: HTTP ${res.status}`);
			return [];
		}
		const xml = await res.text();
		return parseRSSItems(xml, source);
	} catch (err) {
		console.warn(`   ⚠️  ${source.name}: ${err.message}`);
		return [];
	}
}

function parseRSSItems(xml, source) {
	const items = [];
	// Simple regex-based XML parsing for RSS items
	const itemMatches = xml.matchAll(/<item[\s\S]*?<\/item>/gi);
	for (const match of itemMatches) {
		const itemXml = match[0];
		const title = extractTag(itemXml, 'title');
		const description = extractTag(itemXml, 'description') || extractTag(itemXml, 'content:encoded');
		const pubDate = extractTag(itemXml, 'pubDate');
		const link = extractTag(itemXml, 'link');
		const category = extractTag(itemXml, 'category');

		if (title && (description || title)) {
			items.push({
				title: stripHtml(title).trim(),
				content: stripHtml(description || title).trim(),
				pubDate: pubDate ? new Date(pubDate) : new Date(),
				link: link || '',
				source: source.name,
				category: category || ''
			});
		}
	}
	return items;
}

function extractTag(xml, tag) {
	// Try namespaced version first
	const patterns = [
		new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'),
		new RegExp(`<${tag}\\s*/>`, 'i')
	];
	for (const p of patterns) {
		const m = xml.match(p);
		if (m && m[1]) return m[1].trim();
	}
	return '';
}

function stripHtml(html) {
	return html
		.replace(/<\/?[^>]+(>|$)/g, ' ')
		.replace(/\s+/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#\d+;/g, '')
		.trim();
}

// ── Topic Mapping ─────────────────────────────────────────────────
function mapToTopic(item) {
	const text = `${item.title} ${item.content} ${item.category}`.toLowerCase();
	const topicKeywords = {
		'Food': ['food', 'restaurant', 'eat', 'dining', 'chef', 'cafe', 'coffee', 'brewery', 'bar', 'pizza', 'taco', 'pho', 'market', 'farmers', 'hoagie', 'cheesesteak', 'water ice'],
		'Events': ['event', 'festival', 'parade', 'celebration', 'fair', 'gathering', 'block party', 'first friday', 'odunde'],
		'Music': ['music', 'concert', 'band', 'jazz', 'hip-hop', 'rap', 'live music', 'orchestra', 'choir', 'record store'],
		'Art': ['art', 'gallery', 'exhibit', 'mural', 'artist', 'sculpture', 'painting', 'studio', 'creative'],
		'Housing': ['housing', 'apartment', 'rent', 'sublet', 'landlord', 'neighborhood', 'development', 'gentrification'],
		'Politics': ['politics', 'mayor', 'council', 'election', 'vote', 'policy', 'budget', 'democrat', 'republican', 'progressive'],
		'Transportation': ['septa', 'traffic', 'bus', 'subway', 'trolley', 'bike', 'driving', 'parking', ' commute', 'transit'],
		'Education': ['school', 'university', 'college', 'student', 'teacher', 'education', 'campus', 'drexel', 'penn', 'temple'],
		'Pets': ['dog', 'cat', 'pet', 'animal', 'puppy', 'kitten', 'vet', 'adoption'],
		'Sports': ['sports', 'phillies', 'eagles', 'sixers', 'flyers', 'union', 'soccer', 'baseball', 'football', 'basketball', 'world cup'],
		'Fitness': ['fitness', 'gym', 'yoga', 'running', 'workout', 'marathon', 'cycling', 'hike', 'trail'],
		'Shopping': ['shopping', 'store', 'shop', 'retail', 'thrift', 'vintage', 'mall', 'market'],
		'Nightlife': ['nightlife', 'club', 'bar', 'happy hour', 'cocktail', 'dance', 'dj', 'late night'],
		'Museums': ['museum', 'exhibit', 'history', 'science', 'art museum', 'franklin institute', 'constitution center'],
		'Parks': ['park', 'garden', 'river', 'trail', 'fairmount', 'wissahickon', 'outdoor', 'green space'],
		'Community': ['community', 'neighborhood', 'local', 'residents', 'activist', 'volunteer', 'nonprofit', 'mutual aid']
	};

	const scores = {};
	for (const [topic, keywords] of Object.entries(topicKeywords)) {
		scores[topic] = keywords.reduce((sum, kw) => sum + (text.includes(kw) ? 1 : 0), 0);
	}

	const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
	return best && best[1] > 0 ? best[0] : 'Community';
}

// ── Generate Discussion Prompts ────────────────────────────────────
function makePrompts(item, topic) {
	const prompts = [];
	const title = item.title;
	const content = item.content.slice(0, 300);

	// Prompt 1: Direct share
	prompts.push(`Just saw this: "${title}" — ${content.slice(0, 120)}... Thoughts?`);

	// Prompt 2: Question format
	prompts.push(`Anyone else hear about ${title.split(':')[0].split('?')[0]}? Sounds like it's happening soon 👀`);

	// Prompt 3: Personal angle
	if (topic === 'Food') {
		prompts.push(`Has anyone tried the new spot mentioned in "${title.split(':')[0]}"? Worth checking out?`);
	} else if (topic === 'Events') {
		prompts.push(`Planning to hit up ${title.split(':')[0]} this weekend. Who's coming?`);
	} else if (topic === 'Music') {
		prompts.push(`New show announced: ${title.split(':')[0]}. Getting tickets or skipping?`);
	} else if (topic === 'Politics') {
		prompts.push(`${title.split(':')[0]} — what's the vibe on this?`);
	} else if (topic === 'Transportation') {
		prompts.push(`SEPTA update: ${title.split(':')[0]}. How's everyone's commute looking?`);
	} else if (topic === 'Housing') {
		prompts.push(`Housing news: ${title.split(':')[0]}. Anyone dealing with this in their neighborhood?`);
	} else {
		prompts.push(`Saw this on ${item.source}: "${title.split(':')[0]}". Relevant to anyone here?`);
	}

	// Prompt 4: Hot take / opinion
	prompts.push(`Opinion: ${title.split(':')[0]} is going to be a big deal for Philly. Change my mind.`);

	// Prompt 5: PSA style
	prompts.push(`PSA: ${title.split(':')[0]}. ${content.slice(0, 80)}...`);

	return prompts;
}

// ── Utilities ──────────────────────────────────────────────────────
function pick(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}
function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

// ── Clean slate ────────────────────────────────────────────────────
async function cleanSlate() {
	if (!GO || !CLEAN_SLATE) return;
	console.log('🧹 Cleaning old seed data...');
	await supabase.from('votes').delete().neq('id', 0);
	await supabase.from('engrams').delete().neq('id', 0);
	await supabase.from('geotopics').delete().neq('id', 0);
	console.log('   ✓ Database wiped.');
}

// ── Seed geotopics ───────────────────────────────────────────────
async function seedGeotopics() {
	console.log('🗺️  Phase 1: Creating Philadelphia geotopics...');
	const geotopics = buildGeotopics();

	if (!GO) {
		console.log(`   Would create ${geotopics.length} geotopics (dry-run).`);
		return geotopics;
	}

	for (let i = 0; i < geotopics.length; i += 500) {
		const batch = geotopics.slice(i, i + 500);
		const { error } = await supabase.from('geotopics').upsert(batch, { onConflict: 'slug' });
		if (error) console.error('   Geotopics batch error:', error.message);
	}
	console.log(`   ✓ Created ${geotopics.length} geotopics.`);
	return geotopics;
}

async function loadGeotopics() {
	const { data, error } = await supabase.from('geotopics').select('*');
	if (error) throw new Error('Failed to load geotopics: ' + error.message);
	if (data && data.length > 0) return data;
	return buildGeotopics();
}

// ── Fetch real content ─────────────────────────────────────────────
async function fetchRealContent() {
	console.log('🌐 Phase 2: Scraping real Philadelphia content...');
	const allItems = [];

	for (const source of RSS_SOURCES) {
		const items = await fetchRSS(source);
		console.log(`   📰 ${source.name}: ${items.length} articles`);
		allItems.push(...items);
		await sleep(500); // be polite
	}

	// Filter for clean, substantial content
	const valid = allItems.filter((i) => {
		if (!i.title || i.title.length < 10) return false;
		if (!isClean(i.title) || !isClean(i.content)) return false;
		return true;
	});

	console.log(`   ✓ ${valid.length} usable articles after filtering.`);
	return valid;
}

// ── Generate posts from real content ─────────────────────────────
function generatePosts(geotopics, items, count) {
	console.log(`🌱 Phase 3: Generating ${count} posts from real content...`);
	const posts = [];
	const devicePool = Array.from(
		{ length: 200 },
		(_, i) => `seed_device_${i.toString(36).padStart(4, '0')}`
	);

	const geoMap = new Map(geotopics.map((g) => [g.topic, g]));

	for (let i = 0; i < count; i++) {
		const item = pick(items);
		const topic = mapToTopic(item);
		const geotopic = geoMap.get(topic) || pick(geotopics);
		const prompts = makePrompts(item, topic);
		let content = pick(prompts);

		// Vary slightly
		if (Math.random() > 0.7) content += pick(['', ' 👀', ' Thoughts?', ' Anyone know more?', '']);

		// Ensure clean
		if (!isClean(content)) {
			content = `Interesting read from ${item.source}: ${item.title}`;
		}

		const title = content.slice(0, 60).replace(/\s+$/g, '');
		const upvotes = randInt(0, 35);
		const downvotes = randInt(0, Math.max(0, upvotes - 3));
		// Backdate: between now and 30 days ago
		const hoursAgo = randInt(0, 30 * 24);
		const createdAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
		const recencyBonus = Math.max(0, 500 * (1 - hoursAgo / 168));
		const weeklyScore = Math.round((upvotes - downvotes) * 10 + recencyBonus);

		posts.push({
			title,
			content,
			cluster: 'general',
			geotopic_id: geotopic.id || 1,
			location_name: 'Philadelphia',
			device_id: pick(devicePool),
			upvotes,
			downvotes,
			weekly_score: weeklyScore,
			created_at: createdAt
		});

		if (i % 100 === 0 && i > 0)
			process.stdout.write(`   ${i}/${count}\r`);
	}
	console.log(`\n   ✓ Generated ${posts.length} posts.`);
	return posts;
}

// ── Insert posts ───────────────────────────────────────────────────
async function insertPosts(posts) {
	console.log('💾 Phase 4: Inserting into Supabase...');
	if (!GO) {
		console.log(`   Dry-run: would insert ${posts.length} posts.`);
		console.log('\n📋 Sample posts:');
		for (const p of posts.slice(0, 5)) {
			console.log(`   [${p.location_name}] ${p.content.slice(0, 70)}...`);
		}
		return [];
	}

	const insertedIds = [];
	for (let i = 0; i < posts.length; i += BATCH_SIZE) {
		const batch = posts.slice(i, i + BATCH_SIZE);
		const { data, error } = await supabase.from('engrams').insert(batch).select('id');
		if (error) {
			console.error(`   Batch ${i / BATCH_SIZE + 1} error:`, error.message);
		} else if (data) {
			insertedIds.push(...data.map((d) => d.id));
			process.stdout.write(`   ${Math.min(i + BATCH_SIZE, posts.length)}/${posts.length}\r`);
		}
	}
	console.log(`\n   ✓ Inserted ${insertedIds.length} posts.`);
	return insertedIds;
}

// ── Insert votes ───────────────────────────────────────────────────
async function insertVotes(postIds) {
	if (!GO || postIds.length === 0) return;
	console.log('🗳️  Phase 5: Adding votes...');
	const devicePool = Array.from(
		{ length: 200 },
		(_, i) => `seed_device_${i.toString(36).padStart(4, '0')}`
	);

	const votes = [];
	for (const engram_id of postIds) {
		const voterCount = randInt(0, 5);
		const usedDevices = new Set();
		for (let v = 0; v < voterCount; v++) {
			let device;
			do {
				device = pick(devicePool);
			} while (usedDevices.has(device));
			usedDevices.add(device);
			votes.push({
				engram_id,
				device_id: device,
				vote_type: Math.random() > 0.2 ? 'up' : 'down'
			});
		}
	}

	for (let i = 0; i < votes.length; i += BATCH_SIZE) {
		const batch = votes.slice(i, i + BATCH_SIZE);
		const { error } = await supabase.from('votes').insert(batch);
		if (error) console.error(`   Votes batch error:`, error.message);
	}
	console.log(`   ✓ Added ${votes.length} votes.`);
}

// ── Update post counts ─────────────────────────────────────────────
async function updatePostCounts(geotopics) {
	if (!GO) return;
	console.log('📊 Phase 6: Updating geotopic post counts...');

	const { data } = await supabase
		.from('engrams')
		.select('geotopic_id')
		.eq('location_name', 'Philadelphia');

	const counts = {};
	for (const row of data || []) {
		counts[row.geotopic_id] = (counts[row.geotopic_id] || 0) + 1;
	}

	const updates = geotopics
		.filter((g) => counts[g.id])
		.map((g) => ({
			id: g.id,
			name: g.name,
			slug: g.slug,
			location_name: g.location_name,
			topic: g.topic,
			post_count: counts[g.id] || 0,
			weekly_score: g.weekly_score || 0
		}));

	for (let i = 0; i < updates.length; i += 500) {
		const chunk = updates.slice(i, i + 500);
		const { error } = await supabase.from('geotopics').upsert(chunk, { onConflict: 'id' });
		if (error) console.error('   Update error:', error.message);
	}
	console.log(`   ✓ Updated ${updates.length} geotopics.`);
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
	console.log('═══════════════════════════════════════════════════');
	console.log('   🔔 Philly Real-Content Seeder');
	console.log(`   Mode: ${GO ? 'LIVE INSERT' : 'DRY-RUN (preview only)'}`);
	console.log(`   Target: ${TARGET_POSTS} posts`);
	if (CLEAN_SLATE) console.log('   Clean slate: YES');
	console.log('═══════════════════════════════════════════════════\n');

	if (CLEAN_SLATE) await cleanSlate();

	const geotopics = await seedGeotopics();
	const loadedGeotopics = GO ? await loadGeotopics() : geotopics;

	const items = await fetchRealContent();
	if (items.length === 0) {
		console.error('\n❌ No content fetched. Check your internet connection or RSS sources.');
		process.exit(1);
	}

	const posts = generatePosts(loadedGeotopics, items, TARGET_POSTS);
	const insertedIds = await insertPosts(posts);
	await insertVotes(insertedIds);
	await updatePostCounts(loadedGeotopics);

	console.log('\n✅ Done.');
	if (!GO) {
		console.log('\n💡 Run with --go to actually insert into Supabase.');
		console.log('   Add --clean to wipe old data first.');
	}
}

main().catch((err) => {
	console.error('\n❌ Fatal error:', err.message);
	process.exit(1);
});
