import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from '@vitest/browser/context';
import GeotopicSelector from './GeotopicSelector.svelte';
import { geotopicService } from '$lib/services/geotopicService.js';
import { aiSuggester } from '$lib/services/aiSuggester.js';

vi.mock('$lib/services/geotopicService.js', () => ({
	geotopicService: {
		getGeotopics: vi.fn(() => Promise.resolve([])),
		createGeotopic: vi.fn(() => Promise.resolve(null))
	}
}));

vi.mock('$lib/services/aiSuggester.js', () => ({
	aiSuggester: {
		resolveGeotopic: vi.fn(() => Promise.resolve({ action: 'manual' }))
	}
}));

vi.mock('$lib/services/locationService.js', () => ({
	locationService: {
		resolveLocation: vi.fn(() => Promise.resolve(null))
	}
}));

const mockGetGeotopics = vi.mocked(geotopicService.getGeotopics);
const mockCreateGeotopic = vi.mocked(geotopicService.createGeotopic);
const mockResolveGeotopic = vi.mocked(aiSuggester.resolveGeotopic);

function makeGeotopic(overrides: Partial<any> = {}): any {
	return {
		id: 1,
		name: 'Default',
		slug: 'default',
		location_name: 'Nowhere',
		topic: 'General',
		created_by: 'user',
		post_count: 0,
		weekly_score: 0,
		status: 'active',
		createdAt: new Date().toISOString(),
		...overrides
	};
}

describe('GeotopicSelector', () => {
	beforeEach(() => {
		mockGetGeotopics.mockReset().mockResolvedValue([]);
		mockCreateGeotopic.mockReset().mockResolvedValue(null);
		mockResolveGeotopic.mockReset().mockResolvedValue({ action: 'manual' } as any);
	});

	it('does not reset the geotopic cache when parent re-renders with a new initialGeotopics prop', async () => {
		const fullCache = [
			makeGeotopic({
				id: 1,
				name: 'Music in Philadelphia',
				slug: 'music-in-philadelphia',
				location_name: 'Philadelphia',
				topic: 'Music',
				post_count: 10
			}),
			makeGeotopic({
				id: 2,
				name: 'Startups in Philadelphia',
				slug: 'startups-in-philadelphia',
				location_name: 'Philadelphia',
				topic: 'Startups',
				post_count: 5
			})
		];

		mockGetGeotopics.mockResolvedValue(fullCache);

		const capturedCalls: any[] = [];
		mockResolveGeotopic.mockImplementation((...args: any[]) => {
			capturedCalls.push(args);
			return Promise.resolve({ action: 'manual' } as any);
		});

		const screen = render(GeotopicSelector, {
			content: '',
			initialGeotopics: [],
			onSelect: () => {}
		});

		// Wait for onMount + refreshGeotopics to resolve
		await vi.waitFor(() => expect(mockGetGeotopics).toHaveBeenCalled());

		// Trigger analysis
		await screen.rerender({ content: 'music show tonight' });
		await new Promise((r) => setTimeout(r, 800));

		await vi.waitFor(() => expect(capturedCalls.length).toBeGreaterThanOrEqual(1));
		const firstCache = capturedCalls[0][2];
		expect(firstCache).toHaveLength(2);

		// Simulate parent re-render with a brand-new initialGeotopics array
		await screen.rerender({
			content: 'startup event',
			initialGeotopics: [
				makeGeotopic({ id: 99, name: 'Trending Only', slug: 'trending-only', post_count: 1 })
			]
		});
		await new Promise((r) => setTimeout(r, 400));

		await vi.waitFor(() => expect(capturedCalls.length).toBeGreaterThanOrEqual(2));
		const lastCache = capturedCalls[capturedCalls.length - 1][2];

		// Cache should still contain the full 2 items, not be reset to the 1 new initial item
		expect(lastCache).toHaveLength(2);
		expect(lastCache.map((g: any) => g.id)).toContain(1);
		expect(lastCache.map((g: any) => g.id)).toContain(2);
	});

	it('creates a new geotopic when user accepts a suggestion and clicks create', async () => {
		const suggested = {
			name: 'Startups in Philadelphia',
			location_name: 'Philadelphia',
			topic: 'Startups'
		};

		const created = makeGeotopic({
			id: 3,
			name: 'Startups in Philadelphia',
			slug: 'startups-in-philadelphia',
			location_name: 'Philadelphia',
			topic: 'Startups',
			created_by: 'ai',
			status: 'emerging'
		});

		mockResolveGeotopic.mockResolvedValue({
			action: 'suggest',
			suggested,
			confidence: 0.8
		} as any);

		mockCreateGeotopic.mockResolvedValue(created);

		const onSelect = vi.fn();
		const screen = render(GeotopicSelector, {
			content: '',
			initialGeotopics: [],
			onSelect
		});

		// Trigger suggestion
		await screen.rerender({ content: 'startups are just wrappers' });
		await new Promise((r) => setTimeout(r, 800));

		// Accept the suggestion — this should reveal the create-new banner
		const acceptBtn = page.getByRole('button', { name: 'Accept' });
		await acceptBtn.click();

		const createBanner = page.getByText('Create new geotopic:');
		await expect.element(createBanner).toBeVisible();

		// Click the create button
		const createBtn = page.getByRole('button', { name: 'Create ✓' });
		await createBtn.click();

		// Verify service call
		await vi.waitFor(() => {
			expect(mockCreateGeotopic).toHaveBeenCalledWith({
				name: 'Startups in Philadelphia',
				location_name: 'Philadelphia',
				topic: 'Startups',
				created_by: 'ai',
				status: 'emerging'
			});
		});

		// Verify callback
		await vi.waitFor(() => {
			expect(onSelect).toHaveBeenCalledWith(
				expect.objectContaining({ id: 3, name: 'Startups in Philadelphia' }),
				'Philadelphia'
			);
		});

		// Create banner should disappear
		await expect.element(createBanner).not.toBeInTheDocument();
	});

	it('preserves the create-new banner when re-analysis runs while a create is pending', async () => {
		const suggested = {
			name: 'Startups in Philadelphia',
			location_name: 'Philadelphia',
			topic: 'Startups'
		};

		mockResolveGeotopic.mockResolvedValue({
			action: 'suggest',
			suggested,
			confidence: 0.8
		} as any);

		const screen = render(GeotopicSelector, {
			content: '',
			initialGeotopics: [],
			onSelect: () => {}
		});

		// Trigger first suggestion
		await screen.rerender({ content: 'startups are just wrappers' });
		await new Promise((r) => setTimeout(r, 800));

		// Accept to show create banner
		await page.getByRole('button', { name: 'Accept' }).click();
		await expect.element(page.getByText('Create new geotopic:')).toBeVisible();

		// Trigger re-analysis by changing content
		await screen.rerender({ content: 'startups are just amazing' });
		await new Promise((r) => setTimeout(r, 800));

		// Banner should still be visible
		await expect.element(page.getByText('Create new geotopic:')).toBeVisible();
	});
});
