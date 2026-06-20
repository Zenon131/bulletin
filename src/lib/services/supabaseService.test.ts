import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabaseService } from './supabaseService.js';

let insertResult: { data: unknown; error: Error | null } = {
	data: null,
	error: new Error('default')
};

const singleMock = vi.fn(() => Promise.resolve(insertResult));
const selectAfterInsertMock = vi.fn(() => ({ single: singleMock }));
const insertMock = vi.fn(() => ({ select: selectAfterInsertMock }));
const selectMock = vi.fn();
const eqMock = vi.fn();

const fromMock = vi.fn(() => ({
	select: selectMock,
	insert: insertMock,
	eq: eqMock
}));

vi.mock('./supabase.js', () => {
	return {
		supabase: {
			from: () => ({
				select: vi.fn(),
				insert: (values: unknown) => ({
					select: () => ({
						single: () =>
							Promise.resolve(
								(values as Record<string, unknown>)?.__insert_result || {
									data: null,
									error: new Error('default')
								}
							)
					})
				})
			})
		}
	};
});

vi.mock('$app/environment', () => ({
	browser: false
}));

vi.mock('./leaderboardService.js', () => ({
	leaderboardService: {
		getWeeklyLeaderboard: vi.fn(() => Promise.resolve([]))
	}
}));

describe('supabaseService.addReply', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		insertResult = { data: null, error: new Error('default') };
	});

	it('returns null for empty replies', async () => {
		const result = await supabaseService.addReply(1, '   ');
		expect(result).toBeNull();
	});

	it('blocks replies that fail the content filter', async () => {
		const result = await supabaseService.addReply(1, 'this is absolute fuck');
		expect(result).toBeNull();
	});

	it('inserts clean replies via the replies table', async () => {
		const successResult = {
			data: {
				id: 123,
				engram_id: 1,
				device_id: 'server',
				content: ' Interested!',
				created_at: '2026-06-20T00:00:00Z'
			},
			error: null
		};

		// We can't easily reach the inline mock from here, so we spy on from
		const fromSpy = vi.spyOn(await import('./supabase.js'), 'supabase', 'get').mockReturnValue({
			from: () => ({
				select: vi.fn(),
				insert: () => ({
					select: () => ({
						single: () => Promise.resolve(successResult)
					})
				})
			})
		} as unknown as typeof import('./supabase.js').supabase);

		const result = await supabaseService.addReply(1, ' Interested!');

		expect(result).toMatchObject({
			id: 123,
			engram_id: 1,
			content: ' Interested!'
		});

		fromSpy.mockRestore();
	});
});

describe('supabaseService.addEngram', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('blocks posts that fail the content filter', async () => {
		const result = await supabaseService.addEngram({
			title: 'title',
			content: 'this is shit'
		});
		expect(result).toBeNull();
	});

	it('passes contact_info through to the insert payload', async () => {
		const insertPayloadSpy = vi.fn(() => ({
			select: () => ({
				single: () =>
					Promise.resolve({
						data: {
							id: 1,
							title: 'Sublet available',
							content: 'Sublet near campus',
							device_id: 'server',
							cluster: 'general',
							geotopic_id: null,
							location_name: null,
							contact_info: 'text me at 215-555-0199',
							upvotes: 0,
							downvotes: 0,
							weekly_score: 0,
							created_at: '2026-06-20T00:00:00Z'
						},
						error: null
					})
			})
		}));

		const fromSpy = vi.spyOn(await import('./supabase.js'), 'supabase', 'get').mockReturnValue({
			from: () => ({
				select: vi.fn(),
				insert: insertPayloadSpy
			})
		} as unknown as typeof import('./supabase.js').supabase);

		const result = await supabaseService.addEngram({
			title: 'Sublet available',
			content: 'Sublet near campus',
			contact_info: 'text me at 215-555-0199'
		});

		expect(insertPayloadSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				contact_info: 'text me at 215-555-0199'
			})
		);
		expect(result?.contact_info).toBe('text me at 215-555-0199');

		fromSpy.mockRestore();
	});
});
