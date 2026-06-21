<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { Card, CardContent, CardFooter, VoteControls } from '$lib/components/index.js';
	import { localStorageService } from '$lib/services/storage.js';
	import { supabaseService } from '$lib/services/supabaseService.js';
	import { geotopicService } from '$lib/services/geotopicService.js';
	import { leaderboardService } from '$lib/services/leaderboardService.js';
	import { userHistoryService } from '$lib/services/userHistoryService.js';
	import { contentFilter } from '$lib/services/contentFilter.js';
	import EngramFormCard from '$lib/components/EngramFormCard.svelte';
	import { onMount } from 'svelte';
	import type { Engram, Geotopic } from '$lib/types/index.js';
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
		} catch (error) {
			return 'server_' + Math.random().toString(36).substring(2, 15);
		}
	}

	let engrams = $state<Engram[]>([]);
	let geotopics = $state<Geotopic[]>([]);
	let loading = $state(true);
	let loadingMore = $state(false);
	let selectedGeotopicId = $state<number | undefined>(undefined);
	let trendingPosts = $state<Engram[]>([]);
	const PAGE_SIZE = 50;
	const MAX_LOADED_POSTS = 300;
	let hasMore = $state(false);

	async function fetchEngrams(geotopicId = selectedGeotopicId, append = false) {
		if (append) {
			loadingMore = true;
		} else {
			loading = true;
		}
		try {
			const offset = append ? engrams.length : 0;
			const { posts, hasMore: more } = await supabaseService.getEngrams(
				undefined,
				geotopicId,
				PAGE_SIZE,
				offset
			);
			hasMore = more;
			engrams = append ? [...engrams, ...posts] : posts;
		} catch (error) {
			console.error('Error fetching engrams:', error);
			if (!append && browser && localStorageService.isAvailable()) {
				engrams = localStorageService.getEngrams();
			}
		} finally {
			loading = false;
			loadingMore = false;
		}
	}

	async function loadMore() {
		if (loadingMore || !hasMore) return;
		if (engrams.length >= MAX_LOADED_POSTS) {
			hasMore = false;
			return;
		}
		await fetchEngrams(selectedGeotopicId, true);
	}

	async function fetchTrending() {
		try {
			const posts = await leaderboardService.getWeeklyLeaderboard(5);
			trendingPosts = posts;
		} catch (error) {
			console.error('Error fetching trending:', error);
		}
	}

	async function fetchGeotopics() {
		try {
			const data = await geotopicService.getGeotopics({ trending: true, limit: 8 });
			geotopics = data;
		} catch (error) {
			console.error('Error fetching geotopics:', error);
		}
	}

	onMount(async () => {
		await Promise.all([fetchEngrams(), fetchGeotopics(), fetchTrending()]);
	});

	const addNewEngram = async (
		title: string,
		content: string,
		geotopic_id?: number,
		location_name?: string,
		contact_info?: string
	) => {
		if (!title || !content) {
			console.error('Cannot add engram: missing title or content');
			return null;
		}

		try {
			const newEngram = await supabaseService.addEngram({
				title,
				content,
				geotopic_id,
				location_name,
				contact_info
			});

			if (newEngram) {
				if (newEngram.geotopic_id) {
					userHistoryService.recordPost(newEngram.geotopic_id);
				}
				engrams = [newEngram, ...engrams];
				await fetchGeotopics();
				return newEngram;
			}
			return null;
		} catch (error) {
			console.error('Error in addNewEngram:', error);
			return null;
		}
	};

	async function handleVote(id: number, direction: 'up' | 'down') {
		try {
			const updatedEngram = await supabaseService.voteEngram(id, direction);
			if (updatedEngram) {
				engrams = engrams.map((engram) => (engram.id === id ? updatedEngram : engram));
			}
		} catch (error) {
			console.error('Error voting on engram:', error);
		}
	}

	// Reply state
	let expandedReplies = $state<Set<number>>(new Set());
	let replyTexts = $state<Record<number, string>>({});
	let replyErrors = $state<Record<number, string>>({});
	let replyWarnings = $state<Record<number, string>>({});

	function replyWarningFor(id: number, text: string) {
		const result = contentFilter.check(text);
		if (!result.clean) {
			replyWarnings = {
				...replyWarnings,
				[id]: `Inappropriate language detected: "${result.matched}". Please revise.`
			};
		} else {
			replyWarnings = { ...replyWarnings, [id]: '' };
		}
	}

	function toggleReplies(id: number) {
		const next = new Set(expandedReplies);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expandedReplies = next;
	}

	async function submitReply(engramId: number) {
		const text = replyTexts[engramId]?.trim();
		if (!text) return;
		const filterResult = contentFilter.check(text);
		if (!filterResult.clean) {
			replyErrors = {
				...replyErrors,
				[engramId]: `Reply blocked: inappropriate language (${filterResult.matched}).`
			};
			return;
		}
		replyErrors = { ...replyErrors, [engramId]: '' };
		replyWarnings = { ...replyWarnings, [engramId]: '' };
		const newReply = await supabaseService.addReply(engramId, text);
		if (newReply) {
			replyTexts = { ...replyTexts, [engramId]: '' };
			engrams = engrams.map((e) => {
				if (e.id !== engramId) return e;
				return { ...e, replies: [...(e.replies || []), newReply] };
			});
		} else {
			replyErrors = { ...replyErrors, [engramId]: 'Failed to post reply.' };
		}
	}

	function selectGeotopic(id?: number) {
		selectedGeotopicId = id;
		fetchEngrams(id);
	}

	function clearGeotopic() {
		selectedGeotopicId = undefined;
		fetchEngrams();
	}
</script>

<svelte:head>
	<title>Bulletin — Your Local Community Board</title>
	<meta
		name="description"
		content="The social network 2026 has been asking for. Hyper-local communities by location and topic."
	/>
</svelte:head>

<main class="container mx-auto mt-14 px-4 py-8">
	<div class="mx-auto max-w-5xl">
		<!-- Hero -->
		<div class="mb-10 content-center-safe text-center">
			<img src="/bulletin logo.svg" alt="Bulletin logo" class="mx-auto w-36" />
			<h1 class="mb-3 text-3xl font-bold tracking-tight text-[hsl(var(--foreground))]">
				Welcome to Bulletin
			</h1>
			<p class="mx-auto max-w-lg text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
				The social network 2026 has been asking for. Share what's happening around you — from music
				shows in Philly to startups in NYC.
			</p>
		</div>

		<!-- Geotopics quick nav -->
		<div class="mb-8">
			<div class="mb-3 flex items-center justify-between">
				<h2
					class="text-sm font-semibold tracking-wider text-[hsl(var(--muted-foreground))] uppercase"
				>
					Trending Geotopics
				</h2>
				<a
					href="/explore"
					data-sveltekit-preload-data="hover"
					class="text-sm font-medium text-black hover:underline">Explore all →</a
				>
			</div>
			<div class="flex gap-2 overflow-x-auto pb-2">
				<button
					onclick={clearGeotopic}
					class={cn(
						'relative rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-all active:scale-95',
						!selectedGeotopicId
							? 'bg-black text-white shadow-md'
							: 'bg-black/5 text-black/70 hover:bg-black/10'
					)}
				>
					All
				</button>
				{#each geotopics as geotopic}
					<button
						onclick={() => selectGeotopic(geotopic.id)}
						class={cn(
							'relative rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-all active:scale-95',
							selectedGeotopicId === geotopic.id
								? 'bg-black text-white shadow-md'
								: 'bg-black/5 text-black/70 hover:bg-black/10'
						)}
					>
						{geotopic.name}
					</button>
				{/each}
			</div>
		</div>

		<!-- Post form -->
		<EngramFormCard onSubmit={addNewEngram} initialGeotopics={geotopics} class="mb-8" />

		<!-- Feed controls -->
		<div class="mb-5 flex items-center justify-between">
			<div class="flex items-center gap-3">
				{#if selectedGeotopicId}
					<div class="flex items-center gap-2">
						<span class="rounded-full bg-black/10 px-2.5 py-1 text-xs font-medium text-black">
							{geotopics.find((g) => g.id === selectedGeotopicId)?.name || 'Geotopic'}
						</span>
						<button
							onclick={clearGeotopic}
							class="text-xs text-[hsl(var(--muted-foreground))] hover:text-black"
						>
							Clear
						</button>
					</div>
				{/if}
			</div>

			<div class="flex items-center">
				{#if loading}
					<div class="text-xs text-[hsl(var(--muted-foreground))]">Loading posts...</div>
				{/if}
			</div>
		</div>

		<!-- Posts grid -->
		<div class="mb-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
			{#each engrams as engram (engram.id)}
				<Card class="overflow-hidden">
					{#snippet children()}
						<div class="px-5 pt-5 pb-3">
							{#if engram.geotopic}
								<a
									href={`/geotopic/${engram.geotopic.slug}`}
									data-sveltekit-preload-data="hover"
									class="inline-flex items-center gap-1 text-xs font-medium text-black hover:underline"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-3 w-3"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle
											cx="12"
											cy="10"
											r="3"
										/></svg
									>
									{engram.geotopic.name}
								</a>
							{:else if engram.location_name}
								<span
									class="inline-flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-3 w-3"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle
											cx="12"
											cy="10"
											r="3"
										/></svg
									>
									{engram.location_name}
								</span>
							{/if}
						</div>

						<CardContent class="px-5 pt-0 pb-4">
							{#snippet children()}
								<p class="text-[15px] leading-relaxed">{engram.content}</p>
								{#if engram.contact_info}
									<p class="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
										📬 {engram.contact_info}
									</p>
								{/if}
							{/snippet}
						</CardContent>

						<CardFooter class="px-5 py-3">
							{#snippet children()}
								<div class="flex w-full items-center justify-between">
									<VoteControls
										upvotes={engram.upvotes}
										downvotes={engram.downvotes}
										userVote={engram.userVote}
										onVote={(direction) => handleVote(engram.id, direction)}
									/>

									<div class="flex items-center gap-3">
										<button
											type="button"
											class="text-xs text-[hsl(var(--muted-foreground))] hover:text-black"
											onclick={() => toggleReplies(engram.id)}
										>
											💬 {engram.replies?.length || 0}
										</button>
										<span class="text-xs text-[hsl(var(--muted-foreground))]">
											{new Date(engram.createdAt).toLocaleDateString()}
										</span>
									</div>
								</div>
							{/snippet}
						</CardFooter>

						{#if expandedReplies.has(engram.id)}
							<div class="border-t border-black/5 px-5 py-3">
								{#if engram.replies && engram.replies.length > 0}
									<div class="mb-3 space-y-2">
										{#each engram.replies as reply}
											<div class="rounded-lg bg-black/5 px-3 py-2">
												<p class="text-sm leading-snug">{reply.content}</p>
												<p class="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">
													{new Date(reply.createdAt).toLocaleDateString()}
												</p>
											</div>
										{/each}
									</div>
								{/if}
								<div class="flex items-end gap-2">
									<textarea
										placeholder="Reply..."
										value={replyTexts[engram.id] || ''}
										oninput={(e) => {
											replyTexts = {
												...replyTexts,
												[engram.id]: e.currentTarget.value
											};
											replyWarningFor(engram.id, e.currentTarget.value);
										}}
										class="min-h-8 w-full resize-none rounded-lg bg-black/5 px-3 py-2 text-sm focus:outline-none"
									></textarea>
									<button
										type="button"
										disabled={!!replyWarnings[engram.id]}
										class="flex h-8 items-center rounded-lg bg-black px-3 text-xs font-medium text-white disabled:bg-black/30 disabled:opacity-60"
										onclick={() => submitReply(engram.id)}
									>
										Send
									</button>
								</div>
								{#if replyWarnings[engram.id]}
									<p class="mt-1 text-xs text-amber-600">{replyWarnings[engram.id]}</p>
								{/if}
								{#if replyErrors[engram.id]}
									<p class="mt-1 text-xs text-red-600">{replyErrors[engram.id]}</p>
								{/if}
							</div>
						{/if}
					{/snippet}
				</Card>
			{/each}
		</div>

		{#if hasMore}
			<div class="mb-12 text-center">
				<button
					onclick={loadMore}
					disabled={loadingMore}
					class="rounded-full bg-black px-6 py-2.5 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-95 disabled:bg-black/50"
				>
					{loadingMore ? 'Loading...' : 'Load more posts'}
				</button>
			</div>
		{/if}

		<!-- Trending -->
		{#if trendingPosts.length > 0}
			<div class="border-t border-[hsl(var(--border))] pt-8">
				<div class="mb-5 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<span class="text-xl">🔥</span>
						<h2 class="text-lg font-bold">Trending This Week</h2>
					</div>
					<a
						href="/leaderboard"
						data-sveltekit-preload-data="hover"
						class="text-sm font-medium text-black hover:underline">View all →</a
					>
				</div>
				<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{#each trendingPosts.slice(0, 3) as post, i}
						<a
							href={`/geotopic/${post.geotopic?.slug || ''}`}
							data-sveltekit-preload-data="hover"
							class="group block"
						>
							<div
								class="rounded-[1.5rem] border border-white/40 bg-white/60 p-5 shadow-xl backdrop-blur-xl transition-all hover:bg-white/70 hover:shadow-2xl"
							>
								<div class="flex items-start gap-3">
									<span class="text-xl font-bold text-[hsl(var(--muted-foreground))]">#{i + 1}</span
									>
									<div class="flex-1">
										<p class="line-clamp-2 text-sm leading-relaxed text-[hsl(var(--foreground))]">
											{post.content}
										</p>
										<div
											class="mt-2 flex items-center gap-3 text-xs text-[hsl(var(--muted-foreground))]"
										>
											<span class="font-medium text-black">
												👍 {post.upvotes - post.downvotes}
											</span>
											{#if post.geotopic}
												<span class="inline-flex items-center gap-1">
													<svg
														xmlns="http://www.w3.org/2000/svg"
														class="h-3 w-3"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="2"
														><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle
															cx="12"
															cy="10"
															r="3"
														/></svg
													>
													{post.geotopic.name}
												</span>
											{/if}
										</div>
									</div>
								</div>
							</div>
						</a>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</main>
