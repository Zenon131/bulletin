/**
 * Bulletin Content Seeder — "The Reddit Strategy"
 *
 * Generates realistic posts and geotopics to give the app an organic,
 * lived-in feel before launch. Designed for 50k+ posts over a few days.
 *
 * Usage:
 *   node scripts/seed-posts.mjs          # interactive dry-run preview
 *   node scripts/seed-posts.mjs --go     # actually insert into Supabase
 *   node scripts/seed-posts.mjs --go --posts 10000 --drip-days 3
 *
 * Cost estimate (with OpenRouter batch generation):
 *   ~$1–3 for 50k posts using cheap models like google/gemini-flash-1.5
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Inline content filter (no external dependency for the script) ──
const BLOCKED_WORDS = [
	'\\bnigger\\b',
	'\\bnigga\\b',
	'\\bfag\\b',
	'\\bfaggot\\b',
	'\\bretard\\b',
	'\\bcunt\\b',
	'\\bchink\\b',
	'\\bkike\\b',
	'\\bspic\\b',
	'\\bcoon\\b',
	'\\bdyke\\b',
	'\\btranny\\b',
	'\\brapist\\b',
	'\\bpedo\\b',
	'\\bkys\\b'
].map((p) => new RegExp(p, 'gi'));

function isClean(text) {
	const normalized = text.toLowerCase();
	return !BLOCKED_WORDS.some((p) => p.test(normalized));
}

// ── CLI args ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const GO = args.includes('--go');
const DRIP_DAYS = Number(parseArg('--drip-days') ?? 0); // 0 = immediate bulk
const TARGET_POSTS = Number(parseArg('--posts') ?? 50000);
const BATCH_SIZE = Number(parseArg('--batch') ?? 1000);
const SKIP_LLM = args.includes('--skip-llm'); // use built-in templates only (free)
const MODEL = parseArg('--model') ?? 'google/gemini-2.5-flash-lite-preview-09-2025'; // current cheap & fast

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
				// Strip surrounding quotes (both single and double)
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
const OPENROUTER_KEY = process.env.VITE_OPENROUTER_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
	console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_KEY. Set them in .env or environment.');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Content library ──────────────────────────────────────────────
const CITIES = [
	'New York City',
	'Philadelphia',
	'San Francisco',
	'Los Angeles',
	'Austin',
	'Chicago',
	'Denver',
	'Seattle',
	'Portland',
	'Boston',
	'Miami',
	'Atlanta',
	'Nashville',
	'Detroit',
	'London',
	'Paris',
	'Berlin',
	'Tokyo',
	'Sydney'
];

const TOPICS = [
	'Music',
	'Startups',
	'Food',
	'Hiking',
	'Tech',
	'Art',
	'Housing',
	'Events',
	'Pets',
	'Dating',
	'Politics',
	'Education',
	'Transportation',
	'Shopping',
	'Gaming',
	'Movies',
	'Books',
	'Gardening',
	'Parenting',
	'Mental Health',
	'Finance',
	'Travel',
	'DIY',
	'Fitness'
];

const OPENERS = [
	'Just found',
	'Anyone else notice',
	'Thoughts on',
	'Has anyone tried',
	"Can't believe",
	"What's the best",
	'Seriously obsessed with',
	'Quick rant about',
	'Unpopular opinion:',
	'Hot take:',
	'Question:',
	'Help me find',
	'Review:',
	'PSA:',
	'Friendly reminder:',
	'Looking for recommendations for',
	'First time at',
	'Finally checked out',
	'Late to the party but',
	'Did everyone already know about'
];

const CLOSERS = [
	'Would love thoughts!',
	'Drop your favorites below 👇',
	"What's your go-to?",
	'Let me know if I missed anything!',
	'Rant over.',
	'Might be my new spot.',
	'Highly recommend.',
	'Kinda overrated tbh.',
	'Worth the hype?',
	'Still thinking about it.',
	'Any hidden gems?',
	'DM me if you want details.',
	'Changed my whole perspective.',
	'Need to go back ASAP.',
	"Can't stop talking about it.",
	'Still on the waitlist 😭',
	'Booked again already.',
	'Why did no one tell me sooner?'
];

const EMOTIONS = [
	'Absolutely love',
	'Hate to admit it but',
	'Kinda disappointed by',
	'Surprisingly into',
	'Lowkey obsessed with',
	'Not sure how I feel about',
	'Totally converted to',
	'Still skeptical about',
	'Genuinely impressed by',
	'Weirdly nostalgic for',
	'Secretly hoping for',
	'Manifesting more',
	'Perpetually confused by',
	'Lowkey jealous of everyone at'
];

const VENUE_PATTERNS = {
	Music: [
		'the venue',
		'that basement spot',
		'the rooftop bar',
		'this jazz club',
		'the open mic',
		'the warehouse',
		'the park amphitheater'
	],
	Startups: [
		'the coworking space',
		'that coffee shop',
		'the accelerator',
		'the meetup',
		'the pitch event',
		'the hackathon',
		'the networking happy hour'
	],
	Food: [
		'the taco truck',
		'that brunch spot',
		'the ramen shop',
		'the farmers market',
		'the food hall',
		'the hole-in-the-wall',
		'the rooftop restaurant'
	],
	Hiking: [
		'the trailhead',
		'that overlook',
		'the summit',
		'the hidden path',
		'the state park',
		'the canyon loop',
		'the waterfall trail'
	],
	Tech: [
		'the demo day',
		'that meetup',
		'the product launch',
		'the office hours',
		'the virtual event',
		'the tech talk'
	],
	Art: [
		'the gallery opening',
		'that street mural',
		'the studio visit',
		'the art walk',
		'the museum exhibit',
		'the pop-up show'
	],
	Housing: [
		'the open house',
		'that apartment complex',
		'the neighborhood walk',
		'the lease signing',
		'the roommate search'
	],
	Events: [
		'the block party',
		'that festival',
		'the community gathering',
		'the charity run',
		'the night market'
	],
	Pets: ['the dog park', 'that pet store', 'the vet clinic', 'the adoption event', 'the groomer'],
	Dating: [
		'the coffee date',
		'that bar',
		'the park bench',
		'the dating app',
		'the blind date spot'
	],
	Politics: [
		'the town hall',
		'that protest',
		'the canvassing event',
		'the debate watch party',
		'the community meeting'
	],
	Education: [
		'the workshop',
		'that class',
		'the lecture series',
		'the study group',
		'the library event'
	],
	Transportation: [
		'the bus stop',
		'that bike lane',
		'the subway station',
		'the rideshare pickup',
		'the parking spot'
	],
	Shopping: [
		'the thrift store',
		'that boutique',
		'the flea market',
		'the online drop',
		'the sample sale'
	],
	Gaming: [
		'the arcade',
		'that LAN center',
		'the board game cafe',
		'the tournament',
		'the home setup'
	],
	Movies: [
		'the indie theater',
		'that film festival',
		'the outdoor screening',
		'the midnight showing',
		'the critics screening'
	],
	Books: [
		'the bookstore',
		'that reading series',
		'the library branch',
		'the book club',
		'the author signing'
	],
	Gardening: [
		'the community garden',
		'that plant shop',
		'the nursery',
		'the rooftop garden',
		'the seed swap'
	],
	Parenting: [
		'the playground',
		'that daycare',
		'the pediatrician',
		'the school fair',
		'the kids museum'
	],
	'Mental Health': [
		'the therapy session',
		'that meditation class',
		'the support group',
		'the wellness retreat',
		'the mental health walk'
	],
	Finance: [
		'the investment club',
		'that financial advisor',
		'the crypto meetup',
		'the stock trading group',
		'the budgeting workshop'
	],
	Travel: [
		'the weekend getaway',
		'that road trip',
		'the staycation',
		'the train ride',
		'the airport lounge'
	],
	DIY: [
		'the makerspace',
		'that craft fair',
		'the tool library',
		'the workshop',
		'the home improvement store'
	],
	Fitness: [
		'the gym',
		'that yoga studio',
		'the running club',
		'the outdoor bootcamp',
		'the climbing gym'
	]
};

const SENTIMENT_ADJ = {
	positive: [
		'amazing',
		'incredible',
		'breathtaking',
		'unreal',
		'perfect',
		'phenomenal',
		'top-tier',
		'elite',
		'magic',
		'vibes'
	],
	neutral: [
		'interesting',
		'decent',
		'okay',
		'fine',
		'alright',
		'solid',
		'average',
		'mid',
		'nothing special',
		'quirky'
	],
	negative: [
		'overrated',
		'disappointing',
		'underwhelming',
		'meh',
		'sketchy',
		'crowded',
		'overpriced',
		'noisy',
		'rushed',
		'generic'
	]
};

// ── LLM Template Generation ──────────────────────────────────────
const LLM_CACHE = new Map(); // topic+city → templates

async function generateTemplatesWithLLM(topic, city, count = 20) {
	const key = `${topic}-${city}`;
	if (LLM_CACHE.has(key)) return LLM_CACHE.get(key);

	if (!OPENROUTER_KEY) {
		console.warn('No OPENROUTER_KEY found — falling back to synthetic templates');
		return [];
	}

	const prompt = `Generate ${count} short, realistic social-media posts (1–3 sentences, no hashtags) that someone in ${city} might post about ${topic}.
Include questions, recommendations, complaints, excitement, and observations. Mention specific neighborhoods, venues, or local details when natural. Vary tone and sentence structure.

Return ONLY a numbered list. No intro, no outro.`;

	try {
		const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${OPENROUTER_KEY}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': 'https://bulletin.app',
				'X-Title': 'Bulletin Seed'
			},
			body: JSON.stringify({
				model: MODEL,
				messages: [{ role: 'user', content: prompt }],
				temperature: 0.9,
				max_tokens: 2000
			})
		});

		if (!res.ok) {
			console.warn(`OpenRouter error ${res.status} for ${topic}/${city}`);
			return [];
		}

		const json = await res.json();
		const text = json.choices?.[0]?.message?.content ?? '';
		const lines = text
			.split('\n')
			.map((l) => l.replace(/^\d+\.\s*/, '').trim())
			.filter((l) => l.length > 10 && l.length < 280);

		LLM_CACHE.set(key, lines);
		return lines;
	} catch (e) {
		console.warn(`LLM fetch failed for ${topic}/${city}:`, e.message);
		return [];
	}
}

// ── Synthetic template generation (free, no LLM) ─────────────────
function makeSyntheticTemplate(topic, city) {
	const venues = VENUE_PATTERNS[topic] || ['that spot', 'the place', 'this venue'];
	const venue = pick(venues);
	const opener = pick(OPENERS);
	const closer = pick(CLOSERS);
	const emotion = pick(EMOTIONS);
	const sentiment = Math.random();
	const adjList =
		sentiment > 0.6
			? SENTIMENT_ADJ.positive
			: sentiment > 0.3
				? SENTIMENT_ADJ.neutral
				: SENTIMENT_ADJ.negative;
	const adj = pick(adjList);
	const neighborhood = pick([
		'downtown',
		'uptown',
		'midtown',
		'the east side',
		'the west side',
		'the waterfront',
		'the old district',
		'the arts district'
	]);

	const patterns = [
		`${opener} ${venue} in ${neighborhood} — ${adj} experience. ${closer}`,
		`${emotion} ${venue} near ${neighborhood} lately. ${adj} vibes but ${pick(['pricey', 'packed', 'hard to get into', 'worth it'])}. ${closer}`,
		"What's everyone's favorite " +
			topic.toLowerCase() +
			` spot in ${city}? Heard ${venue} in ${neighborhood} is ${adj}.`,
		`Just got back from ${venue} in ${neighborhood}. Honestly ${adj}. ${closer}`,
		`Random question: is ${venue} in ${neighborhood} still ${adj}? Thinking of going this weekend. ${closer}`,
		`Hot take: ${venue} in ${neighborhood} is ${pick(['wildly underrated', 'severely overrated', 'the best kept secret', 'not worth the hype'])}. ${closer}`,
		`Need a ${topic.toLowerCase()} rec in ${city} — ${neighborhood} area preferred. Used to love ${venue} but it's ${pick(['too crowded now', 'gone downhill', 'booked solid'])}.`,
		`${opener} ${venue} last night in ${neighborhood}. ${adj} energy. ${closer}`,
		`Lowkey the ${topic.toLowerCase()} scene in ${city} is ${adj} right now. ${venue} in ${neighborhood} proves it.`,
		`Friendly reminder that ${venue} in ${neighborhood} exists and is ${adj}. ${closer}`,
		`Rant: why is every ${topic.toLowerCase()} spot in ${neighborhood} so ${pick(['expensive', 'crowded', 'loud', 'basic'])}? Miss when ${venue} was ${adj}.`,
		`First time exploring ${topic.toLowerCase()} in ${city}. Started at ${venue} in ${neighborhood} and it was ${adj}. Where next?`,
		`${opener} ${venue} for ${topic.toLowerCase()} — ${adj} but ${pick(['the staff is amazing', 'the location is perfect', 'the hours are weird', 'parking is a nightmare'])}. ${closer}`,
		`Weekend plans: ${venue} in ${neighborhood} for ${topic.toLowerCase()}. Heard it's ${adj} lately. ${closer}`,
		`Anyone else feel like ${topic.toLowerCase()} in ${city} has gotten ${pick(['better', 'worse', 'weirder', 'more expensive', 'more interesting'])}? ${venue} in ${neighborhood} is ${adj} tho.`
	];

	let text = pick(patterns);
	// Light remix: vary casing, add/remove punctuation, swap synonyms
	text = text.replace(/venue/g, () => pick(venues));
	text = text.replace(/neighborhood/g, () => neighborhood);
	if (Math.random() > 0.7)
		text = text + ' ' + pick(['👀', '🔥', '✨', '💯', '🤔', '😭', '🙌', '⚡️', '']);
	return text;
}

// ── Utilities ────────────────────────────────────────────────────
function pick(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randomDate(daysBack = 90) {
	const now = Date.now();
	const offset = Math.random() * daysBack * 24 * 60 * 60 * 1000;
	return new Date(now - offset).toISOString();
}
function slugify(name) {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}
function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

// ── Phase 1: Generate / upsert geotopics ─────────────────────────
function buildGeotopics() {
	const geotopics = [];
	for (const city of CITIES) {
		for (const topic of TOPICS) {
			const name = `${topic} in ${city}`;
			const slug = slugify(name);
			geotopics.push({
				name,
				slug,
				description: `Community for ${topic.toLowerCase()} in ${city}`,
				location_name: city,
				topic,
				created_by: Math.random() > 0.3 ? 'user' : 'ai',
				status: Math.random() > 0.7 ? 'active' : 'emerging',
				post_count: 0,
				weekly_score: 0
			});
		}
	}
	return geotopics;
}

async function seedGeotopics() {
	console.log('🗺️  Phase 1: Ensuring geotopics exist...');
	const existing = await supabase.from('geotopics').select('slug');
	const existingSlugs = new Set((existing.data || []).map((g) => g.slug));

	const geotopics = buildGeotopics().filter((g) => !existingSlugs.has(g.slug));

	if (geotopics.length === 0) {
		console.log('   All geotopics already exist.');
		return;
	}

	if (!GO) {
		console.log(`   Would create ${geotopics.length} new geotopics (dry-run).`);
		return;
	}

	// Upsert in batches
	for (let i = 0; i < geotopics.length; i += 500) {
		const batch = geotopics.slice(i, i + 500);
		const { error } = await supabase.from('geotopics').upsert(batch, { onConflict: 'slug' });
		if (error) console.error('   Geotopics batch error:', error.message);
		else process.stdout.write(`   ${Math.min(i + 500, geotopics.length)}/${geotopics.length}\r`);
	}
	console.log(`\n   Created/updated ${geotopics.length} geotopics.`);
}

// ── Phase 2: Load geotopics into memory ───────────────────────────
async function loadGeotopics() {
	const { data, error } = await supabase.from('geotopics').select('*');
	if (error) throw new Error('Failed to load geotopics: ' + error.message);
	if (data && data.length > 0) return data;
	// Dry-run fallback: build from constants so preview still works
	return buildGeotopics();
}

// ── Phase 3: Generate post templates ─────────────────────────────
async function buildTemplateLibrary(geotopics) {
	console.log('✍️  Phase 2: Building post template library...');
	const library = new Map(); // geotopic_id → templates[]

	// Group by topic for efficient LLM batching
	const byTopic = new Map();
	for (const g of geotopics) {
		if (!byTopic.has(g.topic)) byTopic.set(g.topic, []);
		byTopic.get(g.topic).push(g);
	}

	let llmCalls = 0;
	let totalTemplates = 0;

	for (const [topic, topicGeotopics] of byTopic) {
		// Pick 3 representative cities per topic for LLM generation
		const sample = topicGeotopics.slice(0, 3);

		for (const g of sample) {
			let templates = [];
			if (!SKIP_LLM && OPENROUTER_KEY) {
				templates = await generateTemplatesWithLLM(g.topic, g.location_name, 20);
				if (templates.length) llmCalls++;
				await sleep(200); // rate limit padding
			}
			// Always fall back to synthetic
			while (templates.length < 40) {
				templates.push(makeSyntheticTemplate(g.topic, g.location_name));
			}
			library.set(g.id, templates);
			totalTemplates += templates.length;
		}

		// For the rest of the cities in this topic, use synthetic only
		for (const g of topicGeotopics.slice(3)) {
			const templates = Array.from({ length: 30 }, () =>
				makeSyntheticTemplate(g.topic, g.location_name)
			);
			library.set(g.id, templates);
			totalTemplates += templates.length;
		}
	}

	console.log(`   ${totalTemplates} templates ready (${llmCalls} LLM calls).`);
	return library;
}

// ── Phase 4: Generate full posts ─────────────────────────────────
function generatePosts(geotopics, templateLibrary, count) {
	console.log(`🌱 Phase 3: Generating ${count.toLocaleString()} posts...`);
	const posts = [];
	const devicePool = Array.from(
		{ length: 2000 },
		(_, i) => `seed_device_${i.toString(36).padStart(4, '0')}`
	);

	for (let i = 0; i < count; i++) {
		const g = pick(geotopics);
		const templates = templateLibrary.get(g.id) || ['Check this out!'];
		let content = pick(templates);

		// Remix: swap city name, vary slightly
		content = content.replace(new RegExp(g.location_name, 'g'), () => g.location_name);
		if (Math.random() > 0.8) content = content.replace(/\.$/, () => pick(['!', '?', '...', '']));

		// Content filter safety net — retry up to 5 times if blocked
		let retries = 0;
		while (!isClean(content) && retries < 5) {
			content = pick(templates);
			content = content.replace(new RegExp(g.location_name, 'g'), () => g.location_name);
			retries++;
		}
		if (!isClean(content)) {
			content = 'Had a great time exploring this spot. Would recommend checking it out!';
		}

		const title = content.slice(0, 60).replace(/\s+$/g, '');
		const upvotes = randInt(0, 45);
		const downvotes = randInt(0, Math.max(0, upvotes - 5));
		const createdAt = randomDate(90);
		const hoursSince = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
		const recencyBonus = Math.max(0, 500 * (1 - hoursSince / 168));
		const weeklyScore = Math.round((upvotes - downvotes) * 10 + recencyBonus);

		posts.push({
			title,
			content,
			cluster: 'general',
			geotopic_id: g.id,
			location_name: g.location_name,
			device_id: pick(devicePool),
			upvotes,
			downvotes,
			weekly_score: weeklyScore,
			created_at: createdAt
		});

		if (i % 5000 === 0 && i > 0)
			process.stdout.write(`   ${i.toLocaleString()}/${count.toLocaleString()}\r`);
	}
	console.log(`\n   Generated ${posts.length.toLocaleString()} posts.`);
	return posts;
}

// ── Phase 5: Insert posts ────────────────────────────────────────
async function insertPosts(posts) {
	console.log('💾 Phase 4: Inserting into Supabase...');
	if (!GO) {
		console.log(
			`   Dry-run: would insert ${posts.length.toLocaleString()} posts in ${Math.ceil(posts.length / BATCH_SIZE)} batches.`
		);
		return [];
	}

	const insertedIds = [];
	for (let i = 0; i < posts.length; i += BATCH_SIZE) {
		const batch = posts.slice(i, i + BATCH_SIZE);
		const { data, error } = await supabase.from('engrams').insert(batch).select('id');
		if (error) {
			console.error(`   Batch ${i / BATCH_SIZE + 1} error:`, error.message);
		} else {
			insertedIds.push(...(data || []).map((d) => d.id));
			process.stdout.write(
				`   ${Math.min(i + BATCH_SIZE, posts.length).toLocaleString()}/${posts.length.toLocaleString()}\r`
			);
		}
		await sleep(50);
	}
	console.log(`\n   Inserted ${insertedIds.length.toLocaleString()} posts.`);
	return insertedIds;
}

// ── Phase 6: Generate votes ──────────────────────────────────────
async function insertVotes(postIds) {
	if (!GO || postIds.length === 0) return;
	console.log('🗳️  Phase 5: Adding votes...');
	const devicePool = Array.from(
		{ length: 2000 },
		(_, i) => `seed_device_${i.toString(36).padStart(4, '0')}`
	);
	const votes = [];

	for (const postId of postIds) {
		const voterCount = randInt(0, 8); // 0–8 votes per post
		const usedDevices = new Set();
		for (let v = 0; v < voterCount; v++) {
			let device;
			do {
				device = pick(devicePool);
			} while (usedDevices.has(device));
			usedDevices.add(device);
			votes.push({
				engram_id: postId,
				device_id: device,
				vote_type: Math.random() > 0.25 ? 'up' : 'down'
			});
		}
	}

	for (let i = 0; i < votes.length; i += 1000) {
		const batch = votes.slice(i, i + 1000);
		const { error } = await supabase.from('votes').insert(batch);
		if (error) console.error('   Votes batch error:', error.message);
		process.stdout.write(
			`   ${Math.min(i + 1000, votes.length).toLocaleString()}/${votes.length.toLocaleString()}\r`
		);
	}
	console.log(`\n   Added ${votes.length.toLocaleString()} votes.`);
}

// ── Phase 7: Update geotopic post counts ─────────────────────────
async function updatePostCounts(geotopics) {
	if (!GO) return;
	console.log('📊 Phase 6: Updating geotopic post counts...');
	// Efficiently count all posts per geotopic in one query
	const { data, error } = await supabase
		.from('engrams')
		.select('geotopic_id')
		.not('geotopic_id', 'is', null);

	if (error) {
		console.error('   Failed to count posts:', error.message);
		return;
	}

	const counts = new Map();
	for (const row of data || []) {
		counts.set(row.geotopic_id, (counts.get(row.geotopic_id) || 0) + 1);
	}

	// Build lookup for required fields
	const geoMap = new Map(geotopics.map((g) => [g.id, g]));

	// Batch update in chunks — upsert needs all NOT NULL columns
	const updates = Array.from(counts.entries()).map(([id, count]) => {
		const g = geoMap.get(id);
		return {
			id,
			name: g?.name || 'Unknown',
			slug: g?.slug || `unknown-${id}`,
			location_name: g?.location_name || 'Unknown',
			topic: g?.topic || 'General',
			post_count: count
		};
	});

	for (let i = 0; i < updates.length; i += 100) {
		const chunk = updates.slice(i, i + 100);
		const { error: upsertError } = await supabase
			.from('geotopics')
			.upsert(chunk, { onConflict: 'id' });
		if (upsertError) console.error('   Post count batch error:', upsertError.message);
	}
	console.log(`   Updated ${updates.length} geotopics.`);
}

// ── Drip mode ────────────────────────────────────────────────────
async function dripInsert(posts, geotopics) {
	console.log(
		`⏳ Drip mode: spreading ${posts.length.toLocaleString()} posts over ${DRIP_DAYS} days...`
	);
	const msPerDay = 24 * 60 * 60 * 1000;
	const now = Date.now();
	const end = now + DRIP_DAYS * msPerDay;
	let inserted = 0;

	for (const post of posts) {
		const targetTime = now + Math.random() * (end - now);
		const delay = targetTime - Date.now();
		if (delay > 0) await sleep(delay);

		const { data, error } = await supabase.from('engrams').insert(post).select('id').single();
		if (!error && data) {
			inserted++;
			// Occasional vote
			if (Math.random() > 0.7) {
				await supabase.from('votes').insert({
					engram_id: data.id,
					device_id: `seed_device_${randInt(0, 1999).toString(36).padStart(4, '0')}`,
					vote_type: Math.random() > 0.25 ? 'up' : 'down'
				});
			}
		}
		if (inserted % 100 === 0) {
			process.stdout.write(`   ${inserted.toLocaleString()}/${posts.length.toLocaleString()}\r`);
		}
	}
	console.log(`\n   Dripped ${inserted.toLocaleString()} posts.`);
	await updatePostCounts(geotopics);
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
	console.log(`\n🚀 Bulletin Seeder`);
	console.log(`   Target: ${TARGET_POSTS.toLocaleString()} posts`);
	console.log(`   Mode: ${GO ? 'LIVE INSERT' : 'DRY-RUN (preview only)'}`);
	console.log(`   Drip: ${DRIP_DAYS > 0 ? DRIP_DAYS + ' days' : 'immediate bulk'}`);
	console.log(`   LLM: ${SKIP_LLM ? 'disabled (synthetic only)' : MODEL}`);
	console.log('');

	await seedGeotopics();
	const geotopics = await loadGeotopics();
	console.log(`   ${geotopics.length} geotopics loaded.`);

	const templateLibrary = await buildTemplateLibrary(geotopics);
	const posts = generatePosts(geotopics, templateLibrary, TARGET_POSTS);

	if (DRIP_DAYS > 0 && GO) {
		await dripInsert(posts, geotopics);
	} else {
		const insertedIds = await insertPosts(posts);
		await insertVotes(insertedIds);
		await updatePostCounts(geotopics);
	}

	console.log('\n✅ Done!');
	if (!GO) {
		console.log('\n💡 This was a dry-run. Add --go to actually insert.');
		console.log('   Example: node scripts/seed-posts.mjs --go --posts 10000');
	}
}

main().catch((e) => {
	console.error('\n❌ Fatal error:', e.message);
	process.exit(1);
});
