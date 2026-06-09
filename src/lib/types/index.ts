// Re-export shared domain types that cross module boundaries
export type { SuggestedGeotopic, ResolvedGeotopic } from '$lib/services/aiSuggester.js';

// App-level types (camelCase, used across the UI)
export interface Engram {
	id: number;
	device_id?: string;
	title: string;
	content: string;
	createdAt: string;
	cluster?: string;
	geotopic_id?: number;
	location_name?: string;
	upvotes: number;
	downvotes: number;
	weekly_score: number;
	userVote?: 'up' | 'down' | null;
	geotopic?: Geotopic;
}

export interface Geotopic {
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
	status: 'emerging' | 'active' | 'trending' | 'archived';
	createdAt: string;
}

export interface LeaderboardEntry {
	id: number;
	engram_id: number;
	rank: number;
	score: number;
	upvotes: number;
	downvotes: number;
	week_start: string;
	engram?: Engram;
}

// Raw Supabase schema types (snake_case, matches the actual DB columns)
// These are used by the Supabase client for type inference on queries.
export interface SupabaseEngramRow {
	id: number;
	device_id: string | null;
	title: string;
	content: string;
	cluster: string | null;
	geotopic_id: number | null;
	location_name: string | null;
	upvotes: number | null;
	downvotes: number | null;
	weekly_score: number | null;
	created_at: string;
}

export interface SupabaseGeotopicRow {
	id: number;
	name: string;
	slug: string;
	description: string | null;
	location_name: string;
	location_lat: number | null;
	location_lng: number | null;
	topic: string;
	created_by: 'user' | 'ai';
	post_count: number | null;
	weekly_score: number | null;
	status: 'emerging' | 'active' | 'trending' | 'archived';
	created_at: string;
}

export interface SupabaseVoteRow {
	id: number;
	engram_id: number;
	device_id: string;
	vote_type: 'up' | 'down';
	created_at: string;
}

export interface SupabaseLeaderboardSnapshotRow {
	id: number;
	engram_id: number;
	rank: number;
	score: number;
	upvotes: number;
	downvotes: number;
	week_start: string;
	created_at: string;
}

export interface Database {
	public: {
		Tables: {
			engrams: {
				Row: SupabaseEngramRow;
				Insert: Omit<
					SupabaseEngramRow,
					'id' | 'created_at' | 'upvotes' | 'downvotes' | 'weekly_score'
				>;
				Update: Partial<Omit<SupabaseEngramRow, 'id' | 'created_at'>>;
			};
			geotopics: {
				Row: SupabaseGeotopicRow;
				Insert: Omit<SupabaseGeotopicRow, 'id' | 'created_at' | 'post_count' | 'weekly_score'>;
				Update: Partial<Omit<SupabaseGeotopicRow, 'id' | 'created_at'>>;
			};
			votes: {
				Row: SupabaseVoteRow;
				Insert: Omit<SupabaseVoteRow, 'id' | 'created_at'>;
				Update: Partial<Omit<SupabaseVoteRow, 'id' | 'created_at'>>;
			};
			leaderboard_snapshots: {
				Row: SupabaseLeaderboardSnapshotRow;
				Insert: Omit<SupabaseLeaderboardSnapshotRow, 'id' | 'created_at'>;
				Update: Partial<Omit<SupabaseLeaderboardSnapshotRow, 'id' | 'created_at'>>;
			};
		};
	};
}
