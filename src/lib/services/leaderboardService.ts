import { supabase } from './supabase.js';
import type { Engram, LeaderboardEntry } from '$lib/types/index.js';
import { browser } from '$app/environment';

function getDeviceId(): string {
	if (!browser) return 'server';
	try {
		let deviceId = localStorage.getItem('bulletin_device_id');
		if (!deviceId) {
			deviceId =
				'device_' +
				Math.random().toString(36).substring(2, 15) +
				Math.random().toString(36).substring(2, 15);
			localStorage.setItem('bulletin_device_id', deviceId);
		}
		return deviceId;
	} catch {
		return 'server_' + Math.random().toString(36).substring(2, 15);
	}
}

// Score algorithm: weighted combination of engagement and recency
// Score = (upvotes - downvotes) * 10 + recency_bonus
// recency_bonus decays over the week
function computeWeeklyScore(engram: Engram): number {
	const voteScore = (engram.upvotes - engram.downvotes) * 10;

	const now = new Date();
	const created = new Date(engram.createdAt);
	const hoursSince = (now.getTime() - created.getTime()) / (1000 * 60 * 60);

	// Recency bonus: 500 points for brand new, decays linearly to 0 over 168 hours (1 week)
	const maxHours = 168;
	const recencyBonus = Math.max(0, 500 * (1 - hoursSince / maxHours));

	return Math.round(voteScore + recencyBonus);
}

export const leaderboardService = {
	computeWeeklyScore,

	async getWeeklyLeaderboard(limit = 100): Promise<Engram[]> {
		// Get posts from the last 7 days, ordered by weekly_score
		const weekAgo = new Date();
		weekAgo.setDate(weekAgo.getDate() - 7);

		const { data, error } = await supabase
			.from('engrams')
			.select('*, votes!votes_engram_id_fkey(*), geotopics!engrams_geotopic_id_fkey(*)')
			.gte('created_at', weekAgo.toISOString())
			.order('weekly_score', { ascending: false })
			.limit(limit);

		if (error) {
			console.error('Error fetching leaderboard:', error);
			return [];
		}

		const deviceId = getDeviceId();
		return (data || []).map((e) => ({
			id: e.id,
			title: e.title,
			content: e.content,
			device_id: e.device_id,
			cluster: e.cluster || 'general',
			geotopic_id: e.geotopic_id,
			location_name: e.location_name,
			upvotes: e.upvotes || 0,
			downvotes: e.downvotes || 0,
			weekly_score: e.weekly_score || 0,
			createdAt: e.created_at,
			userVote:
				(e.votes as { device_id: string; vote_type: 'up' | 'down' }[])?.find(
					(v) => v.device_id === deviceId
				)?.vote_type || null,
			geotopic: e.geotopics
				? {
						id: e.geotopics.id,
						name: e.geotopics.name,
						slug: e.geotopics.slug,
						description: e.geotopics.description,
						location_name: e.geotopics.location_name,
						location_lat: e.geotopics.location_lat,
						location_lng: e.geotopics.location_lng,
						topic: e.geotopics.topic,
						created_by: e.geotopics.created_by,
						post_count: e.geotopics.post_count || 0,
						weekly_score: e.geotopics.weekly_score || 0,
						status: e.geotopics.status || 'emerging',
						createdAt: e.geotopics.created_at
					}
				: undefined
		}));
	},

	async refreshScores(): Promise<void> {
		const { data: engrams, error } = await supabase
			.from('engrams')
			.select('*')
			.gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

		if (error || !engrams) {
			console.error('Error refreshing scores:', error);
			return;
		}

		for (const engram of engrams) {
			const score = computeWeeklyScore({
				id: engram.id,
				title: engram.title,
				content: engram.content,
				device_id: engram.device_id,
				cluster: engram.cluster,
				geotopic_id: engram.geotopic_id,
				location_name: engram.location_name,
				upvotes: engram.upvotes || 0,
				downvotes: engram.downvotes || 0,
				weekly_score: engram.weekly_score || 0,
				createdAt: engram.created_at
			});

			await supabase.from('engrams').update({ weekly_score: score }).eq('id', engram.id);
		}
	},

	async saveWeeklySnapshot(): Promise<boolean> {
		const leaderboard = await this.getWeeklyLeaderboard(100);

		const weekStart = new Date();
		weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of current week (Sunday)
		weekStart.setHours(0, 0, 0, 0);
		const weekStartStr = weekStart.toISOString().split('T')[0];

		// Clear existing snapshot for this week
		await supabase.from('leaderboard_snapshots').delete().eq('week_start', weekStartStr);

		const entries = leaderboard.map((engram, index) => ({
			engram_id: engram.id,
			rank: index + 1,
			score: engram.weekly_score,
			upvotes: engram.upvotes,
			downvotes: engram.downvotes,
			week_start: weekStartStr
		}));

		if (entries.length === 0) return true;

		const { error } = await supabase.from('leaderboard_snapshots').insert(entries);

		if (error) {
			console.error('Error saving leaderboard snapshot:', error);
			return false;
		}

		return true;
	},

	async getHistoricalSnapshots(weekStart?: string): Promise<LeaderboardEntry[]> {
		let query = supabase
			.from('leaderboard_snapshots')
			.select('*, engrams(*)')
			.order('rank', { ascending: true });

		if (weekStart) {
			query = query.eq('week_start', weekStart);
		} else {
			// Get most recent week
			const { data: latest } = await supabase
				.from('leaderboard_snapshots')
				.select('week_start')
				.order('week_start', { ascending: false })
				.limit(1)
				.single();

			if (latest) {
				query = query.eq('week_start', latest.week_start);
			}
		}

		const { data, error } = await query.limit(100);

		if (error) {
			console.error('Error fetching historical snapshots:', error);
			return [];
		}

		return (data || []).map((entry) => ({
			id: entry.id,
			engram_id: entry.engram_id,
			rank: entry.rank,
			score: entry.score,
			upvotes: entry.upvotes,
			downvotes: entry.downvotes,
			week_start: entry.week_start,
			engram: entry.engrams
				? {
						id: entry.engrams.id,
						title: entry.engrams.title,
						content: entry.engrams.content,
						device_id: entry.engrams.device_id,
						cluster: entry.engrams.cluster,
						geotopic_id: entry.engrams.geotopic_id,
						location_name: entry.engrams.location_name,
						upvotes: entry.engrams.upvotes || 0,
						downvotes: entry.engrams.downvotes || 0,
						weekly_score: entry.engrams.weekly_score || 0,
						createdAt: entry.engrams.created_at
					}
				: undefined
		}));
	}
};
