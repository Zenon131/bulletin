import { supabase } from './supabase.js';
import type { Engram } from '$lib/types/index.js';
import { browser } from '$app/environment';
import { leaderboardService } from './leaderboardService.js';
import { contentFilter } from './contentFilter.js';

// Function to get or create a device ID for anonymous use
function getDeviceId(): string {
	if (!browser) return 'server';

	let deviceId = localStorage.getItem('bulletin_device_id');

	if (!deviceId) {
		deviceId =
			'device_' +
			Math.random().toString(36).substring(2, 15) +
			Math.random().toString(36).substring(2, 15);
		localStorage.setItem('bulletin_device_id', deviceId);
	}

	return deviceId;
}

// Define vote interface
interface Vote {
	id: number;
	engram_id: number;
	device_id: string;
	vote_type: 'up' | 'down';
	created_at: string;
}

// Define extended Supabase Engram type with votes
interface SupabaseEngram {
	id: number;
	title: string;
	content: string;
	device_id: string | null;
	cluster?: string;
	geotopic_id?: number;
	location_name?: string;
	upvotes: number;
	downvotes: number;
	weekly_score: number;
	status?: 'emerging' | 'active' | 'trending' | 'archived';
	created_at: string;
	votes?: Vote[];
	geotopics?: {
		id: number;
		name: string;
		slug: string;
		description?: string;
		location_name: string;
		location_lat?: number;
		location_lng?: number;
		topic: string;
		created_by: 'user' | 'ai';
		post_count: number;
		weekly_score: number;
		status?: 'emerging' | 'active' | 'trending' | 'archived';
		created_at: string;
	};
}

function mapEngram(engram: SupabaseEngram, deviceId: string): Engram {
	const userVote =
		engram.votes?.find((vote: Vote) => vote.device_id === deviceId)?.vote_type || null;

	return {
		id: engram.id,
		title: engram.title,
		content: engram.content,
		device_id: engram.device_id || undefined,
		cluster: engram.cluster || 'general',
		geotopic_id: engram.geotopic_id,
		location_name: engram.location_name,
		upvotes: engram.upvotes || 0,
		downvotes: engram.downvotes || 0,
		weekly_score: engram.weekly_score || 0,
		createdAt: engram.created_at,
		userVote,
		geotopic: engram.geotopics
			? {
					id: engram.geotopics.id,
					name: engram.geotopics.name,
					slug: engram.geotopics.slug,
					description: engram.geotopics.description,
					location_name: engram.geotopics.location_name,
					location_lat: engram.geotopics.location_lat,
					location_lng: engram.geotopics.location_lng,
					topic: engram.geotopics.topic,
					created_by: engram.geotopics.created_by,
					post_count: engram.geotopics.post_count || 0,
					weekly_score: engram.geotopics.weekly_score || 0,
					status: engram.geotopics.status || 'emerging',
					createdAt: engram.geotopics.created_at
				}
			: undefined
	};
}

/**
 * Service for handling Engram data operations via Supabase
 */
export const supabaseService = {
	/**
	 * Fetches all engrams from Supabase
	 * @param cluster Optional cluster filter
	 * @param geotopicId Optional geotopic filter
	 */
	async getEngrams(cluster?: string, geotopicId?: number): Promise<Engram[]> {
		let query = supabase
			.from('engrams')
			.select('*, votes!votes_engram_id_fkey(*), geotopics!engrams_geotopic_id_fkey(*)');

		// Filter by cluster if provided
		if (cluster && cluster !== 'all') {
			query = query.eq('cluster', cluster);
		}

		// Filter by geotopic if provided
		if (geotopicId) {
			query = query.eq('geotopic_id', geotopicId);
		}

		const { data, error } = await query.order('created_at', { ascending: false });

		if (error) {
			console.error('Error fetching engrams:', error);
			return [];
		}

		const deviceId = getDeviceId();

		return (data || []).map((engram: SupabaseEngram) => mapEngram(engram, deviceId));
	},

	/**
	 * Fetches a single engram by ID
	 */
	async getEngram(id: number): Promise<Engram | null> {
		const { data, error } = await supabase
			.from('engrams')
			.select('*, votes!votes_engram_id_fkey(*), geotopics!engrams_geotopic_id_fkey(*)')
			.eq('id', id)
			.single();

		if (error || !data) {
			console.error('Error fetching engram:', error);
			return null;
		}

		const deviceId = getDeviceId();
		return mapEngram(data as SupabaseEngram, deviceId);
	},

	/**
	 * Adds a new engram
	 */
	async addEngram({
		title,
		content,
		cluster = 'general',
		geotopic_id,
		location_name
	}: {
		title: string;
		content: string;
		cluster?: string;
		geotopic_id?: number;
		location_name?: string;
	}): Promise<Engram | null> {
		// Server-side content filter safety net
		const filterResult = contentFilter.check(`${title} ${content}`);
		if (!filterResult.clean) {
			console.error('Content filter blocked post:', filterResult.matched);
			return null;
		}

		const deviceId = getDeviceId();

		const insertData = {
			title,
			content,
			cluster,
			geotopic_id: geotopic_id || null,
			location_name: location_name || null,
			device_id: deviceId,
			upvotes: 0,
			downvotes: 0,
			weekly_score: 500 // Start with full recency bonus
		};

		const { data, error } = await supabase
			.from('engrams')
			.insert(insertData)
			.select('*, geotopics!engrams_geotopic_id_fkey(*)')
			.single();

		if (error || !data) {
			console.error('Error adding engram:', error);
			return null;
		}

		// Increment post count on geotopic if applicable
		if (geotopic_id) {
			const { data: geotopic } = await supabase
				.from('geotopics')
				.select('post_count')
				.eq('id', geotopic_id)
				.single();

			if (geotopic) {
				await supabase
					.from('geotopics')
					.update({ post_count: (geotopic.post_count || 0) + 1 })
					.eq('id', geotopic_id);
			}
		}

		return mapEngram(data as SupabaseEngram, deviceId);
	},

	/**
	 * Updates an existing engram
	 */
	async updateEngram(
		id: number,
		{
			title,
			content,
			cluster,
			geotopic_id,
			location_name
		}: {
			title?: string;
			content?: string;
			cluster?: string;
			geotopic_id?: number;
			location_name?: string;
		}
	): Promise<Engram | null> {
		const updateData: Record<string, string | number | null> = {};
		if (title !== undefined) updateData.title = title;
		if (content !== undefined) updateData.content = content;
		if (cluster !== undefined) updateData.cluster = cluster;
		if (geotopic_id !== undefined) updateData.geotopic_id = geotopic_id;
		if (location_name !== undefined) updateData.location_name = location_name;

		const { data, error } = await supabase
			.from('engrams')
			.update(updateData)
			.eq('id', id)
			.select('*, geotopics!engrams_geotopic_id_fkey(*)')
			.single();

		if (error || !data) {
			console.error('Error updating engram:', error);
			return null;
		}

		const deviceId = getDeviceId();
		return mapEngram(data as SupabaseEngram, deviceId);
	},

	/**
	 * Deletes an engram by ID
	 */
	async deleteEngram(id: number): Promise<boolean> {
		const { error } = await supabase.from('engrams').delete().eq('id', id);

		if (error) {
			console.error('Error deleting engram:', error);
			return false;
		}

		return true;
	},

	/**
	 * Vote on an engram (upvote or downvote)
	 */
	async voteEngram(id: number, direction: 'up' | 'down'): Promise<Engram | null> {
		const deviceId = getDeviceId();

		const { data: currentEngram, error: fetchError } = await supabase
			.from('engrams')
			.select('*')
			.eq('id', id)
			.single();

		if (fetchError || !currentEngram) {
			console.error('Error fetching engram for voting:', fetchError);
			return null;
		}

		const { data: existingVote } = await supabase
			.from('votes')
			.select('*')
			.eq('engram_id', id)
			.eq('device_id', deviceId)
			.single();

		let updateFields: Record<string, number> = {};
		let userVote: 'up' | 'down' | null = direction;

		if (!existingVote) {
			const { error: voteError } = await supabase.from('votes').insert({
				engram_id: id,
				device_id: deviceId,
				vote_type: direction
			});

			if (voteError) {
				console.error('Error adding vote:', voteError);
				return null;
			}

			updateFields =
				direction === 'up'
					? { upvotes: (currentEngram.upvotes || 0) + 1 }
					: { downvotes: (currentEngram.downvotes || 0) + 1 };
		} else if (existingVote.vote_type === direction) {
			const { error: deleteError } = await supabase
				.from('votes')
				.delete()
				.eq('engram_id', id)
				.eq('device_id', deviceId);

			if (deleteError) {
				console.error('Error removing vote:', deleteError);
				return null;
			}

			updateFields =
				direction === 'up'
					? { upvotes: Math.max(0, (currentEngram.upvotes || 0) - 1) }
					: { downvotes: Math.max(0, (currentEngram.downvotes || 0) - 1) };

			userVote = null;
		} else {
			const { error: updateError } = await supabase
				.from('votes')
				.update({ vote_type: direction })
				.eq('engram_id', id)
				.eq('device_id', deviceId);

			if (updateError) {
				console.error('Error updating vote:', updateError);
				return null;
			}

			updateFields =
				direction === 'up'
					? {
							upvotes: (currentEngram.upvotes || 0) + 1,
							downvotes: Math.max(0, (currentEngram.downvotes || 0) - 1)
						}
					: {
							upvotes: Math.max(0, (currentEngram.upvotes || 0) - 1),
							downvotes: (currentEngram.downvotes || 0) + 1
						};
		}

		// Recompute weekly score after vote change
		const newUpvotes =
			updateFields.upvotes !== undefined ? updateFields.upvotes : currentEngram.upvotes;
		const newDownvotes =
			updateFields.downvotes !== undefined ? updateFields.downvotes : currentEngram.downvotes;
		const tempEngram: Engram = {
			id: currentEngram.id,
			title: currentEngram.title,
			content: currentEngram.content,
			device_id: currentEngram.device_id,
			cluster: currentEngram.cluster,
			geotopic_id: currentEngram.geotopic_id,
			location_name: currentEngram.location_name,
			upvotes: newUpvotes || 0,
			downvotes: newDownvotes || 0,
			weekly_score: currentEngram.weekly_score || 0,
			createdAt: currentEngram.created_at
		};
		updateFields.weekly_score = leaderboardService.computeWeeklyScore(tempEngram);

		const { data: updatedEngram, error: updateError } = await supabase
			.from('engrams')
			.update(updateFields)
			.eq('id', id)
			.select('*, geotopics!engrams_geotopic_id_fkey(*)')
			.single();

		if (updateError) {
			console.error('Error updating engram votes:', updateError);
			return null;
		}

		return mapEngram(updatedEngram as SupabaseEngram, deviceId);
	}
};
