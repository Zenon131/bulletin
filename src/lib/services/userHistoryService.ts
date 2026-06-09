import { browser } from '$app/environment';

const STORAGE_KEY = 'bulletin_post_history';

interface HistoryEntry {
	geotopicId: number;
	count: number;
	lastPosted: string;
}

export const userHistoryService = {
	getHistory(): Record<number, HistoryEntry> {
		if (!browser) return {};
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			return raw ? JSON.parse(raw) : {};
		} catch {
			return {};
		}
	},

	recordPost(geotopicId: number) {
		if (!browser) return;
		const history = this.getHistory();
		history[geotopicId] = {
			geotopicId,
			count: (history[geotopicId]?.count || 0) + 1,
			lastPosted: new Date().toISOString()
		};
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
		} catch {
			// storage full — non-critical
		}
	},

	getTopGeotopic(): number | undefined {
		const history = this.getHistory();
		const sorted = Object.values(history).sort((a, b) => b.count - a.count);
		return sorted[0]?.geotopicId;
	},

	getCount(geotopicId: number): number {
		return this.getHistory()[geotopicId]?.count || 0;
	},

	getLastPosted(geotopicId: number): string | undefined {
		return this.getHistory()[geotopicId]?.lastPosted;
	},

	// Return a flat Record<geotopicId, count> for quick scoring lookups
	getCounts(): Record<number, number> {
		const history = this.getHistory();
		const counts: Record<number, number> = {};
		for (const [id, entry] of Object.entries(history)) {
			counts[Number(id)] = entry.count;
		}
		return counts;
	}
};
