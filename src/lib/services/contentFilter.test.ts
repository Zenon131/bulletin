import { describe, it, expect } from 'vitest';
import { contentFilter, checkContent, isClean, sanitize } from './contentFilter.js';

describe('contentFilter.check', () => {
	it('returns clean for normal community posts', () => {
		const result = checkContent('Looking for a sublet near University City');
		expect(result.clean).toBe(true);
		expect(result.severity).toBe('none');
	});

	it('blocks severe slurs and reports the matched word', () => {
		const result = checkContent('this is a nigger post');
		expect(result.clean).toBe(false);
		expect(result.severity).toBe('severe');
		expect(result.matched).toMatch(/nigg/);
	});

	it('blocks LGBTQ+ slurs in strict mode', () => {
		const result = checkContent('you are such a faggot');
		expect(result.clean).toBe(false);
		expect(result.severity).toBe('severe');
	});

	it('blocks general profanity in strict mode', () => {
		const result = checkContent('what the fuck is this');
		expect(result.clean).toBe(false);
		expect(result.severity).toBe('mild');
	});

	it('allows general profanity when strict=false', () => {
		const result = checkContent('what the fuck is this', false);
		expect(result.clean).toBe(true);
	});

	it('still blocks slurs when strict=false', () => {
		const result = checkContent('this is a nigger post', false);
		expect(result.clean).toBe(false);
		expect(result.severity).toBe('severe');
	});

	it('isClean returns true for clean text', () => {
		expect(isClean('free food at Van Pelt today')).toBe(true);
	});

	it('isClean returns false for filtered text', () => {
		expect(isClean('shut up bitch')).toBe(false);
	});

	it('sanitize replaces blocked words with asterisks', () => {
		const result = sanitize('what the fuck is this');
		expect(result).toContain('****');
		expect(result).not.toContain('fuck');
	});
});

describe('contentFilter convenience object', () => {
	it('matches the shape used by callers', () => {
		expect(contentFilter.check).toBeDefined();
		expect(contentFilter.isClean).toBeDefined();
		expect(contentFilter.sanitize).toBeDefined();
	});
});
