import { openRouterService } from './openRouterService.js';
import type { Geotopic } from '$lib/types/index.js';

export interface SuggestedGeotopic {
	name: string;
	location_name: string;
	topic: string;
	confidence: number;
	source: 'llm' | 'heuristic';
}

export interface ExistingMatch {
	geotopic: Geotopic;
	score: number;
}

export interface ResolvedGeotopic {
	action: 'assign' | 'suggest' | 'offer_choices' | 'manual';
	geotopic?: Geotopic;
	suggested?: SuggestedGeotopic;
	choices?: ExistingMatch[];
	final_confidence: number;
	is_new: boolean;
}

const KNOWN_LOCATIONS = [
	'new york',
	'nyc',
	'manhattan',
	'brooklyn',
	'queens',
	'bronx',
	'philadelphia',
	'philly',
	'center city',
	'fishtown',
	'san francisco',
	'sf',
	'bay area',
	'oakland',
	'berkeley',
	'los angeles',
	'la',
	'santa monica',
	'venice',
	'austin',
	'atx',
	'east austin',
	'south austin',
	'chicago',
	'wicker park',
	'logan square',
	'denver',
	'boulder',
	'fort collins',
	'seattle',
	'portland',
	'boston',
	'cambridge',
	'miami',
	'atlanta',
	'nashville',
	'detroit',
	'london',
	'paris',
	'berlin',
	'tokyo',
	'sydney'
];

const KNOWN_TOPICS = [
	'music',
	'shows',
	'concerts',
	'live music',
	'jazz',
	'electronic',
	'hip hop',
	'startups',
	'tech',
	'founders',
	'fundraising',
	'vc',
	'jobs',
	'hiring',
	'food',
	'restaurants',
	'tacos',
	'pizza',
	'bbq',
	'brunch',
	'coffee',
	'hiking',
	'running',
	'cycling',
	'yoga',
	'fitness',
	'sports',
	'art',
	'gallery',
	'museum',
	'street art',
	'photography',
	'housing',
	'apartments',
	'rent',
	'roommates',
	'events',
	'meetups',
	'networking',
	'parties',
	'pets',
	'dogs',
	'cats',
	'dating',
	'relationships',
	'singles',
	'politics',
	'activism',
	'community',
	'education',
	'classes',
	'workshops',
	'learning',
	'transportation',
	'traffic',
	'public transit',
	'biking',
	'shopping',
	'fashion',
	'vintage',
	'markets',
	'gaming',
	'board games',
	'video games',
	'esports',
	'movies',
	'film',
	'theater',
	'comedy',
	'standup',
	'books',
	'reading',
	'writing',
	'poetry',
	'gardening',
	'plants',
	'farmers market',
	'parenting',
	'kids',
	'family',
	'mental health',
	'therapy',
	'wellness',
	'finance',
	'investing',
	'crypto',
	'stocks',
	'travel',
	'weekend trips',
	'camping',
	'diy',
	'crafts',
	'makers',
	'3d printing',
	'general'
];

function titleCase(str: string): string {
	return str
		.split(' ')
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}

function extractLocation(text: string): { name: string; confidence: number } | null {
	const lower = text.toLowerCase();

	for (const loc of KNOWN_LOCATIONS) {
		// Use word-boundary regex so short abbreviations like "la" / "sf" / "nyc"
		// don't match inside unrelated words (e.g. "large", "suffering").
		const escaped = loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const pattern = new RegExp(`\\b${escaped}\\b`, 'i');
		if (pattern.test(lower)) {
			let name = loc;
			if (
				loc === 'nyc' ||
				loc === 'manhattan' ||
				loc === 'brooklyn' ||
				loc === 'queens' ||
				loc === 'bronx'
			)
				name = 'New York City';
			else if (loc === 'philly' || loc === 'center city' || loc === 'fishtown')
				name = 'Philadelphia';
			else if (loc === 'sf' || loc === 'oakland' || loc === 'berkeley') name = 'San Francisco';
			else if (loc === 'la' || loc === 'santa monica' || loc === 'venice') name = 'Los Angeles';
			else if (loc === 'atx' || loc === 'east austin' || loc === 'south austin') name = 'Austin';
			else if (loc === 'wicker park' || loc === 'logan square') name = 'Chicago';
			else name = titleCase(loc);

			return { name, confidence: 0.9 };
		}
	}

	const inPattern = /(?:in|near|around|at)\s+([A-Z][a-zA-Z\s]+(?:City|Town|Village)?)/;
	const match = text.match(inPattern);
	if (match) {
		const possible = match[1].trim();
		if (possible.length > 2 && possible.length < 40) {
			return { name: possible, confidence: 0.6 };
		}
	}

	return null;
}

function extractTopic(text: string): { name: string; confidence: number } | null {
	const lower = text.toLowerCase();
	let bestTopic: string | null = null;
	let bestConfidence = 0;

	for (const topic of KNOWN_TOPICS) {
		// Word-boundary regex so "art" doesn't match inside "startup".
		const escaped = topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const pattern = new RegExp(`\\b${escaped}\\b`, 'i');
		if (pattern.test(lower)) {
			const confidence = topic.includes(' ') ? 0.95 : 0.75;
			if (confidence > bestConfidence) {
				bestConfidence = confidence;
				bestTopic = topic;
			}
		}
	}

	if (bestTopic) {
		const cleaned = bestTopic
			.split(' ')
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(' ');
		return { name: cleaned, confidence: bestConfidence };
	}

	return null;
}

function heuristicSuggest(
	title: string,
	content: string,
	locationHint?: string
): SuggestedGeotopic | null {
	const fullText = `${title} ${content}`;

	const textLocation = extractLocation(fullText);
	const topic = extractTopic(fullText);

	// Prefer location explicitly written in the text (confidence 0.9).
	// Fall back to the user's detected GPS/IP/history location (confidence 0.8).
	const location = textLocation || (locationHint ? { name: locationHint, confidence: 0.8 } : null);

	// If we have no location at all (no text mention + no GPS/IP/history), bail out.
	if (!location) {
		return null;
	}

	// No topic found → safe fallback "General in [Location]"
	if (!topic) {
		return {
			name: `General in ${location.name}`,
			location_name: location.name,
			topic: 'General',
			confidence: location.confidence * 0.75,
			source: 'heuristic'
		};
	}

	const name = `${topic.name} in ${location.name}`;
	const confidence = (location.confidence + topic.confidence) / 2;

	return {
		name,
		location_name: location.name,
		topic: topic.name,
		confidence,
		source: 'heuristic'
	};
}

// Simple LRU-style cache for suggestion results
const suggestCache = new Map<string, SuggestedGeotopic | null>();
const CACHE_MAX_SIZE = 100;

export const aiSuggester = {
	async suggestGeotopic(
		title: string,
		content: string,
		locationHint?: string
	): Promise<SuggestedGeotopic | null> {
		const cacheKey = `${title}::${content}::${locationHint || ''}`;
		const cached = suggestCache.get(cacheKey);
		if (cached !== undefined) return cached;

		// Fast path: very short text likely has no useful signal
		const fullText = `${title} ${content}`.trim();
		if (fullText.length < 8) {
			suggestCache.set(cacheKey, null);
			return null;
		}

		// 1. Try fast local heuristic first (instant, no network).
		const heuristic = heuristicSuggest(title, content, locationHint);
		if (heuristic) {
			if (suggestCache.size >= CACHE_MAX_SIZE) {
				const firstKey = suggestCache.keys().next().value;
				suggestCache.delete(firstKey);
			}
			suggestCache.set(cacheKey, heuristic);
			return heuristic;
		}

		// 2. Fall back to LLM only for edge cases heuristic can't handle
		const llmResult = await openRouterService.extractGeotopic(title, content);
		if (llmResult) {
			const name = `${llmResult.topic} in ${llmResult.location_name}`;
			const result = {
				name,
				location_name: llmResult.location_name,
				topic: llmResult.topic,
				confidence: llmResult.confidence,
				source: 'llm' as const
			};
			if (suggestCache.size >= CACHE_MAX_SIZE) {
				const firstKey = suggestCache.keys().next().value;
				suggestCache.delete(firstKey);
			}
			suggestCache.set(cacheKey, result);
			return result;
		}

		if (suggestCache.size >= CACHE_MAX_SIZE) {
			const firstKey = suggestCache.keys().next().value;
			suggestCache.delete(firstKey);
		}
		suggestCache.set(cacheKey, null);
		return null;
	},

	computeFinalConfidence(topicConfidence: number, matchScore?: number): number {
		return matchScore !== undefined
			? topicConfidence * 0.5 + matchScore * 0.5
			: topicConfidence * 0.6;
	},

	async resolveGeotopic(
		title: string,
		content: string,
		allGeotopics: Geotopic[],
		locationHint?: string,
		history?: Record<number, number>
	): Promise<ResolvedGeotopic> {
		let suggestion = await this.suggestGeotopic(title, content, locationHint);

		// If the text has no location/topic but we know the user's location,
		// fall back to "General in [Location]" so the post isn't orphaned.
		if (!suggestion && locationHint) {
			suggestion = {
				name: `General in ${locationHint}`,
				location_name: locationHint,
				topic: 'General',
				confidence: 0.6,
				source: 'heuristic'
			};
		}

		if (!suggestion) {
			return { action: 'manual', final_confidence: 0, is_new: false };
		}

		// --- Location trust gate ---
		// If the user's actual location (GPS/IP/history) is known and the AI
		// suggested a DIFFERENT city, check whether the text explicitly mentions
		// that city. If it doesn't, the LLM hallucinated the location — override
		// it back to the user's location so posts don't end up in the wrong city.
		if (locationHint && suggestion.location_name !== locationHint) {
			const textMentionsSuggestedLoc =
				extractLocation(`${title} ${content}`)?.name === suggestion.location_name;
			if (!textMentionsSuggestedLoc) {
				suggestion = {
					...suggestion,
					location_name: locationHint,
					name: `${suggestion.topic} in ${locationHint}`,
					confidence: suggestion.confidence * 0.85,
					source: 'heuristic'
				};
			}
		}

		const match = this.matchExistingGeotopic(
			`${title} ${content}`,
			allGeotopics,
			locationHint || suggestion.location_name,
			history
		);

		// If the best-matched existing geotopic is in a different city than what
		// the AI suggested, ignore it — a Philadelphia post shouldn't get filed
		// under a Los-Angeles geotopic just because the topic score is high.
		const validMatch =
			match && match.geotopic.location_name === suggestion.location_name ? match : null;

		let final_confidence = this.computeFinalConfidence(suggestion.confidence, validMatch?.score);

		// "General in [Location]" is a safe fallback — always present it as a suggestion
		// rather than dumping the user into manual search.
		if (suggestion.topic === 'General' && suggestion.location_name) {
			final_confidence = Math.max(final_confidence, 0.65);
		}

		if (final_confidence >= 0.9) {
			return {
				action: 'assign',
				geotopic: validMatch?.geotopic,
				suggested: suggestion,
				final_confidence,
				is_new: !validMatch
			};
		}

		if (final_confidence >= 0.6) {
			return {
				action: 'suggest',
				geotopic: validMatch?.geotopic,
				suggested: suggestion,
				final_confidence,
				is_new: !validMatch
			};
		}

		if (final_confidence >= 0.4) {
			const choices = this.findSimilarGeotopics(
				`${title} ${content}`,
				allGeotopics,
				locationHint || suggestion.location_name,
				history,
				3
			);
			return {
				action: 'offer_choices',
				choices,
				suggested: suggestion,
				final_confidence,
				is_new: !validMatch
			};
		}

		return {
			action: 'manual',
			suggested: suggestion,
			final_confidence,
			is_new: false
		};
	},

	findSimilarGeotopics(
		text: string,
		geotopics: Geotopic[],
		locationHint?: string,
		history?: Record<number, number>,
		limit = 3
	): ExistingMatch[] {
		const lower = text.toLowerCase();
		const scored: ExistingMatch[] = [];

		for (const g of geotopics) {
			let score = 0;
			const topicLower = g.topic.toLowerCase();
			const locLower = g.location_name.toLowerCase();

			if (lower.includes(topicLower)) score += 0.55;
			if (locationHint) {
				const hintLower = locationHint.toLowerCase();
				if (locLower.includes(hintLower) || hintLower.includes(locLower)) score += 0.25;
			}
			if (lower.includes(locLower)) score += 0.15;

			const nameWords = g.name
				.toLowerCase()
				.split(/\s+/)
				.filter(
					(w) => w.length > 2 && !['the', 'and', 'for', 'with', 'from', 'your', 'new'].includes(w)
				);
			const nameMatches = nameWords.filter((w) => lower.includes(w)).length;
			if (nameMatches > 0) score += (nameMatches / Math.max(1, nameWords.length)) * 0.25;

			if (history && history[g.id]) score += Math.min(0.3, history[g.id] * 0.1);

			scored.push({ geotopic: g, score });
		}

		return scored.sort((a, b) => b.score - a.score).slice(0, limit);
	},

	matchExistingGeotopic(
		text: string,
		geotopics: Geotopic[],
		locationHint?: string,
		history?: Record<number, number>
	): ExistingMatch | null {
		const lower = text.toLowerCase();
		let best: ExistingMatch | null = null;

		for (const g of geotopics) {
			let score = 0;
			const topicLower = g.topic.toLowerCase();
			const locLower = g.location_name.toLowerCase();
			const nameLower = g.name.toLowerCase();

			if (lower.includes(topicLower)) {
				score += 0.55;
			} else {
				const topicWords = topicLower.split(/\s+/).filter((w) => w.length > 2);
				const matched = topicWords.filter((w) => lower.includes(w)).length;
				if (matched > 0) score += (matched / Math.max(1, topicWords.length)) * 0.35;
			}

			if (locationHint) {
				const hintLower = locationHint.toLowerCase();
				if (locLower.includes(hintLower) || hintLower.includes(locLower)) {
					score += 0.25;
				}
			}
			if (lower.includes(locLower)) {
				score += 0.15;
			}

			const nameWords = nameLower
				.split(/\s+/)
				.filter(
					(w) => w.length > 2 && !['the', 'and', 'for', 'with', 'from', 'your', 'new'].includes(w)
				);
			const nameMatches = nameWords.filter((w) => lower.includes(w)).length;
			if (nameMatches > 0) {
				score += (nameMatches / Math.max(1, nameWords.length)) * 0.25;
			}

			if (history && history[g.id]) {
				score += Math.min(0.3, history[g.id] * 0.1);
			}

			if (score > (best?.score ?? 0)) {
				best = { geotopic: g, score };
			}
		}

		return best && best.score >= 0.45 ? best : null;
	},

	discoverFromPosts(posts: { title: string; content: string }[]): SuggestedGeotopic[] {
		const suggestions = new Map<string, SuggestedGeotopic>();

		for (const post of posts) {
			const suggestion = heuristicSuggest(post.title, post.content);
			if (suggestion && suggestion.confidence > 0.7) {
				const key = `${suggestion.location_name}-${suggestion.topic}`;
				if (!suggestions.has(key)) {
					suggestions.set(key, suggestion);
				}
			}
		}

		return Array.from(suggestions.values()).sort((a, b) => b.confidence - a.confidence);
	}
};
