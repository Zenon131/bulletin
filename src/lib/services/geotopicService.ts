import { supabase } from './supabase.js';
import type { Geotopic } from '$lib/types/index.js';

export const geotopicService = {
	async getGeotopics(options?: {
		location?: string;
		topic?: string;
		search?: string;
		trending?: boolean;
		recent?: boolean;
		status?: ('emerging' | 'active' | 'trending' | 'archived')[];
		limit?: number;
	}): Promise<Geotopic[]> {
		let query = supabase.from('geotopics').select('*');

		if (options?.search) {
			// Search across name, location_name, and topic simultaneously
			const term = options.search;
			query = query.or(`name.ilike.%${term}%,location_name.ilike.%${term}%,topic.ilike.%${term}%`);
		}

		if (options?.location) {
			query = query.ilike('location_name', `%${options.location}%`);
		}

		if (options?.topic) {
			query = query.ilike('topic', `%${options.topic}%`);
		}

		if (options?.status && options.status.length > 0) {
			query = query.in('status', options.status);
		} else {
			// Default: only show active and trending geotopics in public lists
			query = query.in('status', ['active', 'trending', 'emerging']);
		}

		if (options?.trending) {
			query = query.order('weekly_score', { ascending: false });
		} else if (options?.recent) {
			query = query.order('created_at', { ascending: false });
		} else {
			query = query.order('post_count', { ascending: false });
		}

		const limit = options?.limit ?? 50;
		query = query.limit(limit);

		const { data, error } = await query;

		if (error) {
			console.error('Error fetching geotopics:', error);
			return [];
		}

		return (data || []).map((g) => ({
			id: g.id,
			name: g.name,
			slug: g.slug,
			description: g.description,
			location_name: g.location_name,
			location_lat: g.location_lat,
			location_lng: g.location_lng,
			topic: g.topic,
			created_by: g.created_by,
			post_count: g.post_count || 0,
			weekly_score: g.weekly_score || 0,
			status: g.status || 'emerging',
			createdAt: g.created_at
		}));
	},

	async getGeotopicBySlug(slug: string): Promise<Geotopic | null> {
		const { data, error } = await supabase.from('geotopics').select('*').eq('slug', slug).single();

		if (error || !data) {
			console.error('Error fetching geotopic:', error);
			return null;
		}

		return {
			id: data.id,
			name: data.name,
			slug: data.slug,
			description: data.description,
			location_name: data.location_name,
			location_lat: data.location_lat,
			location_lng: data.location_lng,
			topic: data.topic,
			created_by: data.created_by,
			post_count: data.post_count || 0,
			weekly_score: data.weekly_score || 0,
			status: data.status || 'emerging',
			createdAt: data.created_at
		};
	},

	async createGeotopic(geotopic: {
		name: string;
		description?: string;
		location_name: string;
		topic: string;
		created_by?: 'user' | 'ai';
		status?: 'emerging' | 'active' | 'trending' | 'archived';
	}): Promise<Geotopic | null> {
		const slug = geotopic.name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');

		// --- Deduplication: return existing geotopic if slug already exists ---
		const { data: existing } = await supabase
			.from('geotopics')
			.select('*')
			.eq('slug', slug)
			.single();

		if (existing) {
			return {
				id: existing.id,
				name: existing.name,
				slug: existing.slug,
				description: existing.description,
				location_name: existing.location_name,
				location_lat: existing.location_lat,
				location_lng: existing.location_lng,
				topic: existing.topic,
				created_by: existing.created_by,
				post_count: existing.post_count || 0,
				weekly_score: existing.weekly_score || 0,
				status: existing.status || 'emerging',
				createdAt: existing.created_at
			};
		}

		const insertPayload = {
			name: geotopic.name,
			slug,
			description: geotopic.description,
			location_name: geotopic.location_name,
			topic: geotopic.topic,
			created_by: geotopic.created_by || 'user',
			status: geotopic.status || 'emerging'
		};

		const { data, error } = await supabase
			.from('geotopics')
			.insert(insertPayload)
			.select()
			.single();

		if (error || !data) {
			console.error('Error creating geotopic:', error);
			return null;
		}

		return {
			id: data.id,
			name: data.name,
			slug: data.slug,
			description: data.description,
			location_name: data.location_name,
			location_lat: data.location_lat,
			location_lng: data.location_lng,
			topic: data.topic,
			created_by: data.created_by,
			post_count: data.post_count || 0,
			weekly_score: data.weekly_score || 0,
			status: data.status || 'emerging',
			createdAt: data.created_at
		};
	},

	async incrementPostCount(geotopicId: number): Promise<boolean> {
		const { error } = await supabase.rpc('increment_geotopic_post_count', {
			geotopic_id: geotopicId
		});

		if (error) {
			const { data: current } = await supabase
				.from('geotopics')
				.select('post_count')
				.eq('id', geotopicId)
				.single();

			if (current) {
				const { error: updateError } = await supabase
					.from('geotopics')
					.update({ post_count: (current.post_count || 0) + 1 })
					.eq('id', geotopicId);

				if (updateError) {
					console.error('Error incrementing post count:', updateError);
					return false;
				}
				return true;
			}
			return false;
		}

		return true;
	}
};
