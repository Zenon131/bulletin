/**
 * Content filter for slurs, hate speech, and harmful language.
 * Runs client-side for real-time feedback and server-side as a safety net.
 */

const BLOCKED_WORDS = [
	// Racial/ethnic slurs
	'\\bnigger\\b',
	'\\bnigga\\b',
	'\\bchink\\b',
	'\\bgook\\b',
	'\\bspic\\b',
	'\\bspick\\b',
	'\\bkike\\b',
	'\\bheeb\\b',
	'\\bwetback\\b',
	'\\bbeaner\\b',
	'\\bcoon\\b',
	'\\bporch\\s*monkey\\b',
	'\\btowel\\s*head\\b',
	'\\bsand\\s*nigger\\b',
	'\\bzipper\\s*head\\b',
	'\\bjap\\b',
	'\\bdago\\b',
	'\\bwop\\b',
	'\\bgypsy\\b',
	'\\bpikey\\b',
	'\\bpaki\\b',
	'\\bcholo\\b',
	'\\bslant\\s*eye\\b',
	'\\byellow\\s*fever\\b',
	'\\bred\\s*skin\\b',
	'\\bsavage\\b',
	// LGBTQ+ slurs
	'\\bfag\\b',
	'\\bfaggot\\b',
	'\\bdyke\\b',
	'\\btranny\\b',
	'\\bshemale\\b',
	'\\bheshe\\b',
	'\\bhomo\\b',
	'\\bqueer\\b',
	'\\bcarpet\\s*muncher\\b',
	// Gender-based slurs
	'\\bcunt\\b',
	'\\bslut\\b',
	'\\bwhore\\b',
	'\\bbitch\\b',
	'\\bskank\\b',
	'\\bthot\\b',
	'\\bho\\b',
	'\\btramp\\b',
	'\\btart\\b',
	'\\bharlot\\b',
	'\\btrollop\\b',
	// Ableist slurs
	'\\bretard\\b',
	'\\bretarded\\b',
	'\\bspaz\\b',
	'\\bspastic\\b',
	'\\bcripple\\b',
	'\\bmong\\b',
	'\\bdownie\\b',
	// Religious slurs
	'\\braghead\\b',
	'\\btowelhead\\b',
	'\\bkebab\\b',
	'\\binfidel\\b',
	'\\bkafir\\b',
	'\\bhymie\\b',
	'\\bshylock\\b',
	// Sexual/violence terms
	'\\brapist\\b',
	'\\bpedo\\b',
	'\\bpedo\\s*phile\\b',
	'\\bmolester\\b',
	'\\bincest\\b',
	'\\bneck\\s*rope\\b',
	'\\bkys\\b',
	'\\bkill\\s*your\\s*self\\b',
	'\\bsuicide\\b',
	'\\bself\\s*harm\\b'
];

const STRICT_WORDS = [
	'\\bshit\\b',
	'\\bfuck\\b',
	'\\bdamn\\b',
	'\\bass\\b',
	'\\basshole\\b',
	'\\bbastard\\b',
	'\\bdick\\b',
	'\\bcock\\b',
	'\\bpussy\\b',
	'\\btits\\b',
	'\\bbollocks\\b',
	'\\bwanker\\b',
	'\\btwat\\b',
	'\\bprick\\b',
	'\\bdouche\\b',
	'\\bdouchebag\\b',
	'\\bjackass\\b',
	'\\bdumbass\\b',
	'\\bmotherfucker\\b',
	'\\bclusterfuck\\b',
	'\\bcrap\\b'
];

const BLOCKED_PATTERNS = BLOCKED_WORDS.map((p) => new RegExp(p, 'gi'));
const STRICT_PATTERNS = STRICT_WORDS.map((p) => new RegExp(p, 'gi'));

export interface FilterResult {
	clean: boolean;
	matched?: string;
	severity: 'none' | 'mild' | 'severe';
}

let compiledPatterns: RegExp[] | null = null;
let compiledStrict: RegExp[] | null = null;

function getPatterns(strict = false): RegExp[] {
	if (!compiledPatterns) compiledPatterns = BLOCKED_PATTERNS;
	if (strict && !compiledStrict) compiledStrict = [...BLOCKED_PATTERNS, ...STRICT_PATTERNS];
	return strict ? compiledStrict! : compiledPatterns!;
}

/**
 * Check text for blocked content.
 * @param text — the text to check
 * @param strict — if true, also blocks general profanity
 * @returns FilterResult with clean status and matched word if found
 */
export function checkContent(text: string, strict = true): FilterResult {
	if (!text || text.trim().length === 0) return { clean: true, severity: 'none' };

	const normalized = text.toLowerCase();
	const patterns = getPatterns(strict);

	for (const pattern of patterns) {
		const match = normalized.match(pattern);
		if (match) {
			// Check if this is a strict-mode word or a core blocked word
			const isStrictOnly = BLOCKED_WORDS.every((w) => !new RegExp(w, 'i').test(match[0]));
			return {
				clean: false,
				matched: match[0],
				severity: isStrictOnly ? 'mild' : 'severe'
			};
		}
	}

	return { clean: true, severity: 'none' };
}

/**
 * Convenience object for import pattern `import { contentFilter }`.
 */
export const contentFilter = {
	check: checkContent,
	isClean,
	sanitize
};

/**
 * Quick check — returns true if text is clean.
 */
export function isClean(text: string, strict = true): boolean {
	return checkContent(text, strict).clean;
}

/**
 * Sanitize text by replacing blocked words with asterisks.
 * Used as a fallback for display purposes.
 */
export function sanitize(text: string, strict = true): string {
	let sanitized = text;
	const patterns = getPatterns(strict);

	for (const pattern of patterns) {
		sanitized = sanitized.replace(pattern, (match) => '*'.repeat(match.length));
	}

	return sanitized;
}
