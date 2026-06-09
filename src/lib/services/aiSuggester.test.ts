import { describe, it, expect } from 'vitest';
import { aiSuggester } from './aiSuggester.js';
import type { Geotopic } from '$lib/types/index.js';

describe('aiSuggester.resolveGeotopic', () => {
	const allGeotopics: Geotopic[] = [
		{
			id: 1,
			name: 'Music in Philadelphia',
			slug: 'music-in-philadelphia',
			location_name: 'Philadelphia',
			topic: 'Music',
			created_by: 'user',
			post_count: 10,
			weekly_score: 0,
			status: 'active',
			createdAt: new Date().toISOString()
		},
		{
			id: 2,
			name: 'General in Philadelphia',
			slug: 'general-in-philadelphia',
			location_name: 'Philadelphia',
			topic: 'General',
			created_by: 'user',
			post_count: 5,
			weekly_score: 0,
			status: 'active',
			createdAt: new Date().toISOString()
		},
		{
			id: 3,
			name: 'Startups in Los Angeles',
			slug: 'startups-in-los-angeles',
			location_name: 'Los Angeles',
			topic: 'Startups',
			created_by: 'user',
			post_count: 8,
			weekly_score: 0,
			status: 'active',
			createdAt: new Date().toISOString()
		}
	];

	it('falls back to "General in [Location]" for generic text with a location hint', async () => {
		const result = await aiSuggester.resolveGeotopic(
			'hello world',
			'hello world',
			allGeotopics,
			'Philadelphia'
		);

		expect(result.action).toBe('suggest');
		expect(result.suggested?.name).toBe('General in Philadelphia');
		expect(result.suggested?.topic).toBe('General');
		expect(result.final_confidence).toBeGreaterThanOrEqual(0.65);
	});

	it('matches existing "General in [Location]" geotopic when text mentions the location', async () => {
		const result = await aiSuggester.resolveGeotopic(
			'hello from philadelphia',
			'hello from philadelphia',
			allGeotopics,
			'Philadelphia'
		);

		expect(result.action).toBe('suggest');
		expect(result.suggested?.name).toBe('General in Philadelphia');
		expect(result.geotopic).toBeDefined();
		expect(result.geotopic?.location_name).toBe('Philadelphia');
	});

	it('returns manual when no location is provided and text has no location', async () => {
		const result = await aiSuggester.resolveGeotopic('hello world', 'hello world', allGeotopics);

		expect(result.action).toBe('manual');
		expect(result.suggested).toBeUndefined();
	});

	it('suggests a specific topic when text contains known topic + location', async () => {
		const result = await aiSuggester.resolveGeotopic(
			'great music show in philadelphia tonight',
			'great music show in philadelphia tonight',
			allGeotopics
		);

		expect(result.suggested?.topic).toBe('Music');
		expect(result.suggested?.location_name).toBe('Philadelphia');
		expect(result.geotopic).toBeDefined();
		expect(result.geotopic?.id).toBe(1);
	});

	it("overrides hallucinated LLM location to the user's actual location", async () => {
		// Text has topic "Music" but no location. The heuristic now receives
		// locationHint, so it creates "Music in Philadelphia" instead of falling
		// back to "General in Philadelphia".
		const result = await aiSuggester.resolveGeotopic(
			'Music show tonight',
			'Music show tonight',
			allGeotopics,
			'Philadelphia'
		);

		expect(result.suggested?.location_name).toBe('Philadelphia');
		expect(result.suggested?.name).toBe('Music in Philadelphia');
		expect(result.action).toBe('suggest');
	});

	it('does NOT override when the text explicitly mentions a different city', async () => {
		// User explicitly says "in Los Angeles" — trust the text even though
		// their current GPS location is Philadelphia (e.g. they are traveling).
		const result = await aiSuggester.resolveGeotopic(
			'great music show in los angeles',
			'great music show in los angeles',
			allGeotopics,
			'Philadelphia'
		);

		expect(result.suggested?.location_name).toBe('Los Angeles');
		expect(result.suggested?.name).toBe('Music in Los Angeles');
	});
});

describe('aiSuggester.suggestGeotopic', () => {
	it('heuristic extracts location-only fallback as General', async () => {
		const result = await aiSuggester.suggestGeotopic('hello world', 'hello world');
		expect(result).toBeNull();
	});

	it('does not match "art" inside "startup"', async () => {
		const result = await aiSuggester.suggestGeotopic(
			'great startup event tonight',
			'great startup event tonight'
		);
		expect(result).toBeNull();
	});

	it('does not match "la" inside "large" or "glass"', async () => {
		const result = await aiSuggester.suggestGeotopic(
			'large glass of water',
			'large glass of water'
		);
		expect(result).toBeNull();
	});

	it('uses locationHint when text has a topic but no location', async () => {
		const result = await aiSuggester.suggestGeotopic(
			'startups are just wrappers',
			'startups are just wrappers',
			'Philadelphia'
		);
		expect(result).not.toBeNull();
		expect(result?.topic).toBe('Startups');
		expect(result?.location_name).toBe('Philadelphia');
		expect(result?.name).toBe('Startups in Philadelphia');
		expect(result?.source).toBe('heuristic');
	});

	it('still prefers location explicitly written in the text over locationHint', async () => {
		const result = await aiSuggester.suggestGeotopic(
			'great music show in los angeles',
			'great music show in los angeles',
			'Philadelphia'
		);
		expect(result).not.toBeNull();
		expect(result?.topic).toBe('Music');
		expect(result?.location_name).toBe('Los Angeles');
		expect(result?.name).toBe('Music in Los Angeles');
	});
});
