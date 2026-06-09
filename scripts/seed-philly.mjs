#!/usr/bin/env node
/**
 * Philly Content Seeder — "The Human Strategy"
 *
 * Fetches actual Philadelphia content from RSS, Reddit, and web search,
 * then rewrites it through varied human personas with local slang,
 * typos, abbreviations, and neighborhood-specific references.
 *
 * Usage:
 *   node scripts/seed-philly.mjs --go --clean --posts 500
 *   node scripts/seed-philly.mjs --posts 100              # dry-run preview
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── CLI args ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const GO = args.includes('--go');
const TARGET_POSTS = Number(parseArg('--posts') ?? 500);
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
const TAVILY_KEY = process.env.TAVILY_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
	console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_KEY. Set them in .env or environment.');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Content filter (inline) ──────────────────────────────────────
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
	return !BLOCKED_WORDS.some((p) => p.test(text.toLowerCase()));
}

// ── Philly-only topics ───────────────────────────────────────────
const TOPICS = [
	'Food',
	'Events',
	'Music',
	'Art',
	'Housing',
	'Politics',
	'Transportation',
	'Education',
	'Pets',
	'Sports',
	'Fitness',
	'Shopping',
	'Nightlife',
	'Museums',
	'Parks',
	'Community'
];

function buildGeotopics() {
	return TOPICS.map((topic) => {
		const name = `${topic} in Philadelphia`;
		return {
			name,
			slug: name
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, ''),
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

// ── Sources ────────────────────────────────────────────────────────
const RSS_SOURCES = [
	{ url: 'https://billypenn.com/feed/', name: 'Billy Penn' },
	{ url: 'https://www.phillyvoice.com/feed/', name: 'PhillyVoice' },
	{ url: 'https://whyy.org/feed/', name: 'WHYY' },
	{ url: 'https://www.phillymag.com/feed/', name: 'Philly Mag' },
	{ url: 'https://patch.com/rss/pennsylvania/philadelphia', name: 'Philly Patch' },
	{ url: 'https://feeds.feedburner.com/philebrity', name: 'Philebrity' }
];

const REDDIT_SOURCES = [
	{ url: 'https://www.reddit.com/r/philadelphia/hot.json?limit=25', name: 'r/philadelphia' },
	{ url: 'https://www.reddit.com/r/philadelphia/new.json?limit=25', name: 'r/philadelphia new' }
];

// ── Fetch & Parse RSS ────────────────────────────────────────────
async function fetchRSS(source) {
	try {
		const res = await fetch(source.url, {
			headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EngramBot/1.0)' }
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
	const itemMatches = xml.matchAll(/<item[\s\S]*?<\/item>/gi);
	for (const match of itemMatches) {
		const itemXml = match[0];
		const title = extractTag(itemXml, 'title');
		const description =
			extractTag(itemXml, 'description') || extractTag(itemXml, 'content:encoded');
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
				category: category || '',
				type: 'rss'
			});
		}
	}
	return items;
}

function extractTag(xml, tag) {
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

// ── Fetch Reddit ───────────────────────────────────────────────────
async function fetchReddit(source) {
	try {
		const res = await fetch(source.url, {
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
				Accept: 'application/json'
			}
		});
		if (!res.ok) {
			console.warn(`   ⚠️  ${source.name}: HTTP ${res.status}`);
			return [];
		}
		const json = await res.json();
		const posts = json?.data?.children || [];
		return posts.map((p) => ({
			title: stripHtml(p.data.title || '').trim(),
			content: stripHtml(p.data.selftext || p.data.title || '').trim(),
			pubDate: new Date(p.data.created_utc * 1000),
			link: `https://reddit.com${p.data.permalink}`,
			source: source.name,
			category: '',
			type: 'reddit'
		}));
	} catch (err) {
		console.warn(`   ⚠️  ${source.name}: ${err.message}`);
		return [];
	}
}

// ── Fetch Tavily Search ──────────────────────────────────────────
async function fetchTavily() {
	if (!TAVILY_KEY) {
		console.log('   ℹ️  No TAVILY_API_KEY found, skipping web search.');
		return [];
	}
	try {
		const res = await fetch('https://api.tavily.com/search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				api_key: TAVILY_KEY,
				query: 'Philadelphia events news happenings this week',
				max_results: 20,
				search_depth: 'basic'
			})
		});
		if (!res.ok) {
			console.warn(`   ⚠️  Tavily: HTTP ${res.status}`);
			return [];
		}
		const json = await res.json();
		return (json.results || []).map((r) => ({
			title: stripHtml(r.title || '').trim(),
			content: stripHtml(r.content || r.title || '').trim(),
			pubDate: new Date(),
			link: r.url || '',
			source: 'Tavily Search',
			category: '',
			type: 'search'
		}));
	} catch (err) {
		console.warn(`   ⚠️  Tavily: ${err.message}`);
		return [];
	}
}

// ── Topic Mapping ─────────────────────────────────────────────────
function mapToTopic(item) {
	const text = `${item.title} ${item.content} ${item.category}`.toLowerCase();
	const topicKeywords = {
		Food: [
			'food',
			'restaurant',
			'eat',
			'dining',
			'chef',
			'cafe',
			'coffee',
			'brewery',
			'bar',
			'pizza',
			'taco',
			'pho',
			'market',
			'farmers',
			'hoagie',
			'cheesesteak',
			'water ice',
			'wawa',
			'brunch',
			'dinner',
			'lunch',
			'cooking',
			'recipe',
			'spicy',
			'vegan',
			'vegetarian',
			'dessert',
			'bakery'
		],
		Events: [
			'event',
			'festival',
			'parade',
			'celebration',
			'fair',
			'gathering',
			'block party',
			'first friday',
			'odunde',
			'pride',
			'concert',
			'show',
			'ticket',
			'rsvp',
			'rsvp',
			'coming up',
			'this weekend',
			'tonight'
		],
		Music: [
			'music',
			'concert',
			'band',
			'jazz',
			'hip-hop',
			'rap',
			'live music',
			'orchestra',
			'choir',
			'record store',
			'spotify',
			'playlist',
			'dj',
			'venue',
			'tour',
			'album',
			'single',
			'drop'
		],
		Art: [
			'art',
			'gallery',
			'exhibit',
			'mural',
			'artist',
			'sculpture',
			'painting',
			'studio',
			'creative',
			'design',
			'photography',
			'installation',
			'street art',
			'graffiti'
		],
		Housing: [
			'housing',
			'apartment',
			'rent',
			'sublet',
			'landlord',
			'neighborhood',
			'development',
			'gentrification',
			'lease',
			'roommate',
			'room for rent',
			'moving',
			'moving out',
			'utilities'
		],
		Politics: [
			'politics',
			'mayor',
			'council',
			'election',
			'vote',
			'policy',
			'budget',
			'democrat',
			'republican',
			'progressive',
			'helen gym',
			'cherelle parker',
			'city hall',
			'ordinance',
			'bill'
		],
		Transportation: [
			'septa',
			'traffic',
			'bus',
			'subway',
			'trolley',
			'bike',
			'driving',
			'parking',
			'commute',
			'transit',
			'regional rail',
			'broad street line',
			'mfl',
			'el',
			'uber',
			'lyft',
			'e-bike',
			'scooter'
		],
		Education: [
			'school',
			'university',
			'college',
			'student',
			'teacher',
			'education',
			'campus',
			'drexel',
			'penn',
			'temple',
			'class',
			'professor',
			'tuition',
			'gpa',
			'finals',
			'midterm'
		],
		Pets: [
			'dog',
			'cat',
			'pet',
			'animal',
			'puppy',
			'kitten',
			'vet',
			'adoption',
			'shelter',
			'dog park',
			'bark',
			'walk',
			'leash',
			'lost dog',
			'found cat'
		],
		Sports: [
			'sports',
			'phillies',
			'eagles',
			'sixers',
			'flyers',
			'union',
			'soccer',
			'baseball',
			'football',
			'basketball',
			'world cup',
			'game',
			'stadium',
			'jawn',
			'playoffs',
			'season',
			'draft'
		],
		Fitness: [
			'fitness',
			'gym',
			'yoga',
			'running',
			'workout',
			'marathon',
			'cycling',
			'hike',
			'trail',
			'lifting',
			'crossfit',
			'peloton',
			'steps',
			'strava',
			'sweat',
			'classpass'
		],
		Shopping: [
			'shopping',
			'store',
			'shop',
			'retail',
			'thrift',
			'vintage',
			'mall',
			'market',
			'outlet',
			'sale',
			'clearance',
			'buy',
			'bought',
			'online order'
		],
		Nightlife: [
			'nightlife',
			'club',
			'bar',
			'happy hour',
			'cocktail',
			'dance',
			'dj',
			'late night',
			'drinks',
			'pub',
			'rooftop',
			'speakeasy',
			'last call',
			'after hours'
		],
		Museums: [
			'museum',
			'exhibit',
			'history',
			'science',
			'art museum',
			'franklin institute',
			'constitution center',
			'independence hall',
			'liberty bell',
			'visitor',
			'tour',
			'gallery'
		],
		Parks: [
			'park',
			'garden',
			'river',
			'trail',
			'fairmount',
			'wissahickon',
			'outdoor',
			'green space',
			'picnic',
			'kelly drive',
			'boathouse row',
			'schuylkill',
			'delaware'
		],
		Community: [
			'community',
			'neighborhood',
			'local',
			'residents',
			'activist',
			'volunteer',
			'nonprofit',
			'mutual aid',
			'west philly',
			'south philly',
			'fishtown',
			'no libs',
			'kensington',
			'germantown'
		]
	};

	const scores = {};
	for (const [topic, keywords] of Object.entries(topicKeywords)) {
		scores[topic] = keywords.reduce((sum, kw) => sum + (text.includes(kw) ? 1 : 0), 0);
	}

	const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
	return best && best[1] > 0 ? best[0] : 'Community';
}

// ── Human Personas ─────────────────────────────────────────────────
const PERSONAS = [
	{
		name: 'college_student',
		styles: [
			'does anyone know if {topic} is still happening?',
			'just heard about {topic} and im kinda intrigued',
			'{topic}?? in THIS economy??',
			'lowkey might check out {topic} this weekend',
			'who going to {topic} fr',
			'{topic} got me reconsidering my whole weekend plans'
		]
	},
	{
		name: 'longtime_resident',
		styles: [
			'been in philly {years} years and {topic} still surprises me',
			'yall seein this {topic}?? only in philly man',
			'{topic} again? this city never changes',
			'im tellin you {topic} is not what it used to be',
			'so {topic} is a thing now? aight then',
			'philly really said "lets do {topic}" and i respect that'
		]
	},
	{
		name: 'newcomer',
		styles: [
			'just moved here — is {topic} worth checking out?',
			'new to philly and keep hearing about {topic}. whats the deal??',
			'okay so {topic} is a thing here? someone explain pls',
			'saw {topic} on my walk today and had no idea that was happening',
			'dont judge me but i just learned about {topic} lol',
			'where the best {topic} at?? asking for a friend'
		]
	},
	{
		name: 'snarky_commenter',
		styles: [
			'{topic} is so unhinged and i am HERE for it',
			'philly said "lets make {topic} happen" and honestly? respect',
			'not {topic} living rent free in my head rn',
			'bruh {topic}??? in philadelphia??? lmao',
			'this city is so chaotic i love it. {topic} fr',
			'nah {topic} is wild and nobody can convince me otherwise'
		]
	},
	{
		name: 'concerned_neighbor',
		styles: [
			'heads up everyone — {topic} is happening around {hood}. stay safe out there',
			'fyi if youre near {hood}, {topic} is going on. just wanted everyone to know',
			'psa: {topic}. be careful if youre in the area',
			'noticed {topic} on my block today. anyone else seeing this?',
			'just a heads up for {hood} folks — {topic}. keep your eyes open',
			'concerned about {topic} in the neighborhood. anyone have more info?'
		]
	},
	{
		name: 'hype_enthusiast',
		styles: [
			'{topic} is about to be fire and nobody can tell me otherwise',
			'omg {topic}??? this is gonna be legendary',
			'if youre sleeping on {topic} youre doing it wrong fr',
			'{topic} is gonna be absolutely insane. cant wait',
			'mark your calendars: {topic}. trust me on this one',
			'yo {topic} is about to go crazy and i need everyone there'
		]
	},
	{
		name: 'casual_observer',
		styles: [
			'idk about {topic} but it sounds kinda interesting',
			'sorta want to check out {topic} but also kinda dont lol',
			'{topic} is a thing i guess. might go, might not',
			'heard about {topic} from a friend. anyone been?',
			'chill vibes at {topic} or nah? tryna figure out my weekend',
			'kinda intrigued by {topic} ngl. worth the hype or overrated?'
		]
	},
	{
		name: 'septa_complainer',
		styles: [
			'septa really said "lets make {topic} worse" and succeeded',
			'{topic} + septa delays = my whole mood ruined',
			'can septa and {topic} both get their act together? asking for a friend',
			'just experienced {topic} AND a 20 min septa delay. love this city smh',
			'septa + {topic} = the philly starter pack nobody asked for',
			'if {topic} happens and septa is on time, is it even real?'
		]
	}
];

const NEIGHBORHOODS = [
	'Center City',
	'Rittenhouse',
	'Old City',
	'Fishtown',
	'Northern Liberties',
	'South Philly',
	'West Philly',
	'University City',
	'Germantown',
	'Kensington',
	'Manayunk',
	'Roxborough',
	'Chestnut Hill',
	'Mt Airy',
	'Passyunk',
	'Queen Village',
	'Society Hill',
	'Graduate Hospital',
	'Brewerytown',
	'Frankford'
];

const LOCAL_REFS = [
	'Wawa',
	'hoagie',
	'water ice',
	'jawn',
	'the el',
	'broad street line',
	'cheesesteak',
	'wiz wit',
	'reading terminal',
	'rittenhouse square',
	'love park',
	'boathouse row',
	'rocky steps',
	'south street',
	'italian market',
	"johnson's",
	"rita's",
	'primo',
	'dalessandros',
	'pats',
	'genos',
	'jims',
	'city hall',
	'the parkway',
	'schuylkill river trail',
	'kelly drive',
	'penn',
	'drexel',
	'temple',
	'villanova',
	'saint joes',
	'lasalle'
];

function pick(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}
function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}
function chance(p) {
	return Math.random() < p;
}

function extractTopicPhrase(title) {
	// Extract the core topic from a title — aggressively clean it
	let phrase = title
		.replace(/^\s*[^a-zA-Z0-9]+\s*/, '') // leading garbage
		.replace(/\d+:\d+\s*[ap]\.m\./gi, '') // time codes
		.replace(/\d+:\d+/g, '') // other times
		.replace(/^\d+\s+/, '') // leading numbers
		.replace(/^[^:]+:\s*/i, '') // "Category: " prefix
		.replace(/\$\d+[\d,.]*/g, ' $$$ ') // replace dollar amounts with $$$
		.replace(/\|.*$/g, '') // everything after pipe
		.replace(/[-–].*$/g, '') // everything after dash
		.replace(/\?.*$/g, '') // everything after question mark
		.replace(/!.*$/g, '') // everything after exclamation
		.trim();

	if (phrase.length > 50) {
		phrase = phrase.slice(0, 50).replace(/\s+\S*$/, '');
	}
	// Remove trailing non-word chars
	phrase = phrase.replace(/[^\w\s]+$/g, '').trim();

	// Drop trailing incomplete words (articles, prepositions, etc.)
	const incomplete = [
		'the',
		'a',
		'an',
		'to',
		'of',
		'in',
		'on',
		'at',
		'by',
		'with',
		'for',
		'from',
		'as',
		'is',
		'are',
		'will',
		'can',
		'should',
		'would',
		'could',
		'has',
		'have',
		'had',
		'been',
		'being',
		'do',
		'does',
		'did',
		'was',
		'were',
		'am',
		'and',
		'or',
		'but',
		'if',
		'that',
		'this',
		'these',
		'those',
		'my',
		'your',
		'his',
		'her',
		'their',
		'our',
		'its',
		'who',
		'what',
		'when',
		'where',
		'why',
		'how'
	];
	const words = phrase.split(/\s+/);
	if (words.length > 1 && incomplete.includes(words[words.length - 1].toLowerCase())) {
		words.pop();
		phrase = words.join(' ');
	}
	// Also drop leading incomplete words
	while (words.length > 1 && incomplete.includes(words[0].toLowerCase())) {
		words.shift();
		phrase = words.join(' ');
	}

	// If phrase is too short or weird, fallback
	if (phrase.split(/\s+/).length < 3 || phrase.length < 15) {
		phrase = 'this';
	}

	return phrase.trim() || 'this';
}

// ── Hyperlocal University City Posts ───────────────────────────────
const HYPERLOCAL_POSTS = [
	// Food / Dining
	{
		topic: 'Food',
		content: 'the halal truck on 38th & spruce is back and the line is already crazy. worth it tho'
	},
	{
		topic: 'Food',
		content:
			'anyone else notice the dunkin on walnut raised prices again? $7 for an iced coffee is insane'
	},
	{
		topic: 'Food',
		content: 'just discovered the secret menu at the vietnamese place near drexel. game changer'
	},
	{ topic: 'Food', content: 'free pizza at houston hall rn if anyone wants to grab some' },
	{
		topic: 'Food',
		content: 'whoever recommended koreatown on 45th — thank you. that bulgogi hit different'
	},
	{
		topic: 'Food',
		content:
			'is the food truck on chestnut still doing $5 cheesesteaks after 8pm? asking for my wallet'
	},
	{ topic: 'Food', content: 'tried the new spot on sansom and honestly? mid. would not recommend' },
	{
		topic: 'Food',
		content: 'the boba place near penn changed owners and its not the same anymore 😭'
	},

	// Housing
	{
		topic: 'Housing',
		content:
			'subletting my room in university city july-august. dm if interested. 2 blocks from campus'
	},
	{
		topic: 'Housing',
		content:
			'my landlord just tried to raise rent $300 and the lease isnt even up yet. is that even legal?'
	},
	{
		topic: 'Housing',
		content:
			'looking for a roommate for fall semester. prefer quiet, no parties. grad student preferred'
	},
	{
		topic: 'Housing',
		content:
			'anyone need furniture? moving out and selling everything cheap. couch, desk, lamp, all gotta go'
	},
	{
		topic: 'Housing',
		content: 'the construction on 40th is so loud i cant sleep past 7am anymore. someone send help'
	},
	{
		topic: 'Housing',
		content: 'just signed a lease in powelton village. hows the area? anything i should know?'
	},
	{
		topic: 'Housing',
		content: 'urgent: need someone to take over my lease ASAP. personal emergency. please dm'
	},

	// Transportation
	{
		topic: 'Transportation',
		content: 'trolley is down again between 40th and 30th. classic septa moment'
	},
	{
		topic: 'Transportation',
		content: 'the 21 bus just drove right past my stop without stopping. i am livid'
	},
	{
		topic: 'Transportation',
		content: 'anyone else notice the bikes on chestnut are all broken? tried 4 different ones'
	},
	{
		topic: 'Transportation',
		content: 'parking on spruce is a nightmare after 6pm. where does everyone park???'
	},
	{
		topic: 'Transportation',
		content: 'just watched someone get their car towed from the lot behind the quad. rough'
	},
	{
		topic: 'Transportation',
		content: 'septa key card stopped working at 40th st. had to walk. great start to monday'
	},

	// Events
	{
		topic: 'Events',
		content: 'theres a block party on locust this saturday. free food and live music. who tryna go?'
	},
	{
		topic: 'Events',
		content:
			'omegathon or whatever its called is happening in the quad and its so loud i cant focus'
	},
	{
		topic: 'Events',
		content:
			'free yoga at clark park at 10am tomorrow. bringing my roommate whether she likes it or not'
	},
	{
		topic: 'Events',
		content: 'anyone going to the penn museum after hours thing? heard its actually fun'
	},
	{
		topic: 'Events',
		content: 'theres some kind of protest on walnut today. traffic is a mess avoid if you can'
	},

	// Education
	{
		topic: 'Education',
		content: 'the library is packed and its not even finals week yet. where are people studying?'
	},
	{
		topic: 'Education',
		content: 'just got waitlisted for the one class i need to graduate. praying rn'
	},
	{
		topic: 'Education',
		content:
			'shoutout to the ta in cis 1210 who actually responds to emails within an hour. goat behavior'
	},
	{
		topic: 'Education',
		content:
			'who else is pulling an all nighter in weiss? ive got snacks and energy drinks to share'
	},
	{
		topic: 'Education',
		content: 'professor cancelled class 5 mins before it started. i walked here for nothing'
	},
	{
		topic: 'Education',
		content: 'anyone have notes from last weeks econ lecture? my laptop died and i lost everything'
	},

	// Community
	{
		topic: 'Community',
		content:
			'shoutout to the person who found my airpods at the gym and turned them in. youre a real one'
	},
	{
		topic: 'Community',
		content: 'lost my penn id near the arch building. if anyone found it please lmk'
	},
	{
		topic: 'Community',
		content: 'the fire alarm in my dorm went off at 3am again. this is the third time this week'
	},
	{
		topic: 'Community',
		content: 'someone keeps stealing packages from our lobby. we got cameras now so good luck'
	},
	{
		topic: 'Community',
		content: 'there was a cat wandering around the quad today. looked lost but very friendly'
	},
	{
		topic: 'Community',
		content:
			'just moved to uc and everyone seems so busy all the time. how do people make friends here?'
	},
	{
		topic: 'Community',
		content: 'the ice cream truck music at 9pm is both comforting and deeply unsettling'
	},
	{
		topic: 'Community',
		content: 'found a pair of glasses on the trolley. turned them into the septa office at 30th st'
	},

	// Sports
	{
		topic: 'Sports',
		content: 'watching the game at the bar on sansom and the energy is unreal. lets go sixers'
	},
	{
		topic: 'Sports',
		content: 'who tryna play pickup basketball at the palestra tomorrow? need 2 more'
	},
	{
		topic: 'Sports',
		content:
			'the penn relay carnival crowds are wild. cant even walk down walnut without getting stuck'
	},
	{
		topic: 'Sports',
		content:
			'tried running kelly drive for the first time and almost died. respect to everyone who does this regularly'
	},

	// Fitness
	{
		topic: 'Fitness',
		content: 'pottruck at 7am is surprisingly empty. best time to go if you hate crowds'
	},
	{
		topic: 'Fitness',
		content: 'the squat racks at the gym are always taken by people doing curls. please stop'
	},
	{
		topic: 'Fitness',
		content: 'anyone wanna be strava buddies? just moved here and need running route recs'
	},

	// Pets
	{
		topic: 'Pets',
		content: 'saw the cutest corgi at clark park today. if youre the owner i love your dog'
	},
	{
		topic: 'Pets',
		content:
			'is the dog park near schuylkill river good for small dogs? nervous about taking my pup there'
	},
	{
		topic: 'Pets',
		content: 'found a lost cat near 42nd and chestnut. orange tabby, very friendly. dm if yours'
	},

	// Nightlife
	{
		topic: 'Nightlife',
		content:
			'the line at franklin mortgage is absurd tonight. is there a secret event or something?'
	},
	{
		topic: 'Nightlife',
		content:
			'new rooftop bar opened near rittenhouse and the views are actually insane. drinks are $$$ tho'
	},
	{
		topic: 'Nightlife',
		content:
			'who knew tuesday night trivia at the pub would be this competitive. my team got destroyed'
	},

	// Parks
	{
		topic: 'Parks',
		content: 'clark park farmers market on saturday has the best produce. the tomatoes are bussin'
	},
	{
		topic: 'Parks',
		content:
			'wissahickon trail is gorgeous right now but mosquitos are absolutely everywhere. bring spray'
	},
	{
		topic: 'Parks',
		content: 'picnic at fairmount park this sunday. bringing sandwiches and a blanket. open invite'
	},

	// Shopping
	{
		topic: 'Shopping',
		content:
			'thrifted the sickest jacket at buffalo exchange on chestnut for $15. yall sleeping on this place'
	},
	{
		topic: 'Shopping',
		content: 'the wawa on 38th was out of hoagie rolls at 11pm. is nothing sacred anymore'
	},
	{
		topic: 'Shopping',
		content:
			'does anyone know where to get a cheap desk chair near campus? amazon is taking too long'
	},

	// Art
	{
		topic: 'Art',
		content: 'the mural on 42nd got tagged again. such a shame it was really beautiful'
	},
	{
		topic: 'Art',
		content: 'first friday in old city tonight. free wine and decent art. perfect date idea tbh'
	},

	// Music
	{
		topic: 'Music',
		content:
			'someone is practicing trumpet near my apartment and its actually kinda fire. keep it up king'
	},
	{ topic: 'Music', content: 'the jazz at south kitchen is unreal on thursdays. hidden gem fr' }
];

function generateHyperlocalPosts(geotopics, count) {
	const posts = [];
	const devicePool = Array.from(
		{ length: 500 },
		(_, i) => `seed_device_${i.toString(36).padStart(4, '0')}`
	);
	const geoMap = new Map(geotopics.map((g) => [g.topic, g]));

	for (let i = 0; i < count; i++) {
		const base = pick(HYPERLOCAL_POSTS);
		const geotopic = geoMap.get(base.topic) || pick(geotopics);

		let content = base.content;
		// Vary with neighborhood references
		if (chance(0.3)) {
			const hood = pick(NEIGHBORHOODS);
			content = content.replace(/\buniversity city\b|\buc\b/gi, hood);
		}
		if (chance(0.3)) {
			content += pick(['', ' 😭', ' 💀', ' 😂', ' 🙏', ' 👀', ' 🔥', ' 🤔']);
		}

		if (!isClean(content)) continue;

		const title = content.slice(0, 60).replace(/\s+$/g, '');
		const upvotes = randInt(0, 50);
		const downvotes = randInt(0, Math.max(0, upvotes - randInt(3, 10)));
		const hoursAgo = randInt(0, 14 * 24);
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
	}
	return posts;
}

// ── Generate Human Posts ─────────────────────────────────────────
function generatePosts(geotopics, items, count) {
	console.log(`🌱 Phase 3: Generating ${count} human-sounding posts...`);
	const posts = [];
	const devicePool = Array.from(
		{ length: 500 },
		(_, i) => `seed_device_${i.toString(36).padStart(4, '0')}`
	);

	const geoMap = new Map(geotopics.map((g) => [g.topic, g]));
	const usedContent = new Set(); // dedupe

	for (let i = 0; i < count; i++) {
		const item = pick(items);
		const topic = mapToTopic(item);
		const geotopic = geoMap.get(topic) || pick(geotopics);
		const persona = pick(PERSONAS);
		const phrase = extractTopicPhrase(item.title);
		const hood = pick(NEIGHBORHOODS);

		// Build the post from persona style
		let template = pick(persona.styles);
		let content = template
			.replace(/{topic}/g, phrase)
			.replace(/{hood}/g, hood)
			.replace(/{years}/g, randInt(2, 30));

		// Light naturalization
		if (chance(0.3)) content = content.toLowerCase();
		if (chance(0.25)) {
			const ref = pick(LOCAL_REFS);
			content += pick([` near ${ref}`, ` by ${ref}`, ` — ${ref} vibes`, ` (shoutout ${ref})`]);
		}
		if (chance(0.3)) {
			content += pick(['', ' 😭', ' 💀', ' 😂', ' 🙏', ' 👀', ' 🔥', ' 🤔']);
		}

		// Deduplicate roughly
		if (usedContent.has(content.slice(0, 40))) {
			content = `${pick(['ngl ', 'tbh ', 'fr ', 'lowkey ', ''])}${content}`;
		}
		usedContent.add(content.slice(0, 40));

		// Ensure clean
		if (!isClean(content)) {
			content = `Saw this on ${item.source}: ${item.title}`;
		}

		const title = content.slice(0, 60).replace(/\s+$/g, '');
		const upvotes = randInt(0, 45);
		const downvotes = randInt(0, Math.max(0, upvotes - randInt(2, 8)));
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

		if (i % 100 === 0 && i > 0) process.stdout.write(`   ${i}/${count}\r`);
	}
	console.log(`\n   ✓ Generated ${posts.length} posts.`);
	return posts;
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

// ── Fetch all content ────────────────────────────────────────────
async function fetchAllContent() {
	console.log('🌐 Phase 2: Scraping real Philadelphia content...');
	const allItems = [];

	// RSS feeds
	for (const source of RSS_SOURCES) {
		const items = await fetchRSS(source);
		console.log(`   📰 ${source.name}: ${items.length} articles`);
		allItems.push(...items);
		await sleep(300);
	}

	// Reddit
	for (const source of REDDIT_SOURCES) {
		const items = await fetchReddit(source);
		console.log(`   🔗 ${source.name}: ${items.length} posts`);
		allItems.push(...items);
		await sleep(300);
	}

	// Tavily web search
	const tavilyItems = await fetchTavily();
	console.log(`   🔍 Tavily Search: ${tavilyItems.length} results`);
	allItems.push(...tavilyItems);

	// Filter for clean, substantial content
	const valid = allItems.filter((i) => {
		if (!i.title || i.title.length < 10) return false;
		if (!isClean(i.title) || !isClean(i.content)) return false;
		return true;
	});

	console.log(`   ✓ ${valid.length} usable items after filtering.`);
	return valid;
}

// ── Insert posts ───────────────────────────────────────────────────
async function insertPosts(posts) {
	console.log('💾 Phase 4: Inserting into Supabase...');
	if (!GO) {
		console.log(`   Dry-run: would insert ${posts.length} posts.`);
		console.log('\n📋 Sample posts:');
		for (const p of posts.slice(0, 8)) {
			console.log(`   "${p.content.slice(0, 90)}..."`);
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
		{ length: 500 },
		(_, i) => `seed_device_${i.toString(36).padStart(4, '0')}`
	);

	const votes = [];
	for (const engram_id of postIds) {
		const voterCount = randInt(0, 6);
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
				vote_type: Math.random() > 0.15 ? 'up' : 'down'
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
	console.log('   🔔 Philly Human Content Seeder');
	console.log(`   Mode: ${GO ? 'LIVE INSERT' : 'DRY-RUN (preview only)'}`);
	console.log(`   Target: ${TARGET_POSTS} posts`);
	if (CLEAN_SLATE) console.log('   Clean slate: YES');
	console.log('═══════════════════════════════════════════════════\n');

	if (CLEAN_SLATE) await cleanSlate();

	const geotopics = await seedGeotopics();
	const loadedGeotopics = GO ? await loadGeotopics() : geotopics;

	const items = await fetchAllContent();
	if (items.length === 0) {
		console.error('\n❌ No content fetched. Check your internet connection.');
		process.exit(1);
	}

	const newsPosts = generatePosts(loadedGeotopics, items, Math.ceil(TARGET_POSTS * 0.6));
	const localPosts = generateHyperlocalPosts(loadedGeotopics, Math.floor(TARGET_POSTS * 0.4));
	const posts = [...newsPosts, ...localPosts].sort(() => Math.random() - 0.5);
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
