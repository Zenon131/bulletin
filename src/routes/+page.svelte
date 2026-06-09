<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { Card, CardContent, CardFooter, VoteControls } from '$lib/components/index.js';
	import { localStorageService } from '$lib/services/storage.js';
	import { supabaseService } from '$lib/services/supabaseService.js';
	import { geotopicService } from '$lib/services/geotopicService.js';
	import { leaderboardService } from '$lib/services/leaderboardService.js';
	import { userHistoryService } from '$lib/services/userHistoryService.js';
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
	let displayedEngrams = $state<Engram[]>([]);
	let geotopics = $state<Geotopic[]>([]);
	let loading = $state(true);
	let selectedGeotopicId = $state<number | undefined>(undefined);
	let trendingPosts = $state<Engram[]>([]);
	let pageSize = $state(50);
	let currentPage = $state(0);

	async function fetchEngrams(geotopicId = selectedGeotopicId) {
		loading = true;
		try {
			const data = await supabaseService.getEngrams(undefined, geotopicId);
			engrams = data;
			displayedEngrams = data.slice(0, pageSize);
			currentPage = 1;
		} catch (error) {
			console.error('Error fetching engrams:', error);
			if (browser && localStorageService.isAvailable()) {
				engrams = localStorageService.getEngrams();
				displayedEngrams = engrams.slice(0, pageSize);
			}
		} finally {
			loading = false;
		}
	}

	function loadMore() {
		const nextPage = currentPage + 1;
		const endIndex = nextPage * pageSize;
		displayedEngrams = engrams.slice(0, endIndex);
		currentPage = nextPage;
	}

	function hasMorePosts() {
		return displayedEngrams.length < engrams.length;
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
		location_name?: string
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
				location_name
			});

			if (newEngram) {
				if (newEngram.geotopic_id) {
					userHistoryService.recordPost(newEngram.geotopic_id);
				}
				engrams = [newEngram, ...engrams];
				displayedEngrams = [newEngram, ...displayedEngrams.slice(0, pageSize - 1)];
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
				displayedEngrams = displayedEngrams.map((engram) =>
					engram.id === id ? updatedEngram : engram
				);
			}
		} catch (error) {
			console.error('Error voting on engram:', error);
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
				<a href="/explore" class="text-sm font-medium text-black hover:underline">Explore all →</a>
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
				{:else}
					<p class="text-xs text-[hsl(var(--muted-foreground))]">
						<strong class="text-[hsl(var(--foreground))]">{engrams.length}</strong> posts
					</p>
				{/if}
			</div>
		</div>

		<!-- Posts grid -->
		<div class="mb-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
			{#each displayedEngrams as engram (engram.id)}
				<Card class="overflow-hidden">
					{#snippet children()}
						<div class="px-5 pt-5 pb-3">
							{#if engram.geotopic}
								<a
									href={`/geotopic/${engram.geotopic.slug}`}
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

									<span class="text-xs text-[hsl(var(--muted-foreground))]">
										{new Date(engram.createdAt).toLocaleDateString()}
									</span>
								</div>
							{/snippet}
						</CardFooter>
					{/snippet}
				</Card>
			{/each}
		</div>

		{#if hasMorePosts()}
			<div class="mb-12 text-center">
				<button
					onclick={loadMore}
					class="rounded-full bg-black px-6 py-2.5 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-95"
				>
					Load more posts
				</button>
				<p class="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
					Showing {displayedEngrams.length} of {engrams.length} posts
				</p>
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
					<a href="/leaderboard" class="text-sm font-medium text-black hover:underline"
						>View all →</a
					>
				</div>
				<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{#each trendingPosts.slice(0, 3) as post, i}
						<a href={`/geotopic/${post.geotopic?.slug || ''}`} class="group block">
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
