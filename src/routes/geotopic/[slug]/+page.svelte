<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { geotopicService } from '$lib/services/geotopicService.js';
	import { supabaseService } from '$lib/services/supabaseService.js';
	import { leaderboardService } from '$lib/services/leaderboardService.js';
	import { userHistoryService } from '$lib/services/userHistoryService.js';
	import type { Geotopic, Engram } from '$lib/types/index.js';
	import {
		Card,
		CardHeader,
		CardFooter,
		CardTitle,
		CardDescription,
		CardContent,
		VoteControls,
		EngramFormCard
	} from '$lib/components/index.js';
	import { contentFilter } from '$lib/services/contentFilter.js';

	let geotopic = $state<Geotopic | null>(null);
	let engrams = $state<Engram[]>([]);
	let loading = $state(true);
	let topPosts = $state<Engram[]>([]);

	const slug = $derived(page.params.slug);

	async function loadGeotopic() {
		loading = true;
		try {
			const topic = await geotopicService.getGeotopicBySlug(slug);
			if (!topic) {
				geotopic = null;
				engrams = [];
				loading = false;
				return;
			}

			geotopic = topic;

			const [posts, trending] = await Promise.all([
				supabaseService.getEngrams(undefined, topic.id),
				leaderboardService.getWeeklyLeaderboard(10)
			]);

			engrams = posts;
			topPosts = trending.filter((p) => p.geotopic_id === topic.id);
		} catch (error) {
			console.error('Error loading geotopic:', error);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (slug) {
			loadGeotopic();
		}
	});

	async function addNewEngram(
		title: string,
		content: string,

		geotopic_id?: number,
		location_name?: string
	) {
		if (!geotopic) return null;

		const filterResult = contentFilter.check(content);
		if (!filterResult.clean) {
			console.warn('Content blocked by filter:', filterResult.matched);
			return null;
		}

		const newEngram = await supabaseService.addEngram({
			title,
			content,

			geotopic_id: geotopic.id,
			location_name: location_name || geotopic.location_name
		});

		if (newEngram) {
			userHistoryService.recordPost(geotopic.id);
			await loadGeotopic();
		}

		return newEngram;
	}

	async function handleVote(id: number, direction: 'up' | 'down') {
		try {
			const updated = await supabaseService.voteEngram(id, direction);
			if (updated) {
				engrams = engrams.map((e) => (e.id === id ? updated : e));
			}
		} catch (error) {
			console.error('Error voting:', error);
		}
	}
</script>

<svelte:head>
	{#if geotopic}
		<title>{geotopic.name} — Bulletin</title>
		<meta
			name="description"
			content={geotopic.description || `Posts about ${geotopic.topic} in ${geotopic.location_name}`}
		/>
	{:else}
		<title>Geotopic — Bulletin</title>
	{/if}
</svelte:head>

<main class="container mx-auto mt-16 px-4 py-8">
	{#if loading}
		<div class="mx-auto max-w-4xl py-12 text-center">
			<div class="text-[hsl(var(--muted-foreground))]">Loading...</div>
		</div>
	{:else if !geotopic}
		<div class="mx-auto max-w-4xl py-12 text-center">
			<h1 class="mb-2 text-2xl font-bold">Geotopic not found</h1>
			<p class="text-[hsl(var(--muted-foreground))]">This geotopic doesn't exist yet.</p>
			<a href="/explore" class="mt-4 inline-block text-black hover:underline">Explore geotopics →</a
			>
		</div>
	{:else}
		<div class="mx-auto max-w-4xl">
			<!-- Header -->
			<div class="mb-8">
				<div class="mb-2 flex items-center gap-3">
					<h1 class="text-3xl font-bold">{geotopic.name}</h1>
					{#if geotopic.created_by === 'ai'}
						<span class="rounded-full bg-black/10 px-2 py-1 text-xs text-black">AI-generated</span>
					{/if}
				</div>

				{#if geotopic.description}
					<p class="mb-3 text-[hsl(var(--muted-foreground))]">{geotopic.description}</p>
				{/if}

				<div class="flex items-center gap-4 text-sm text-[hsl(var(--muted-foreground))]">
					<span>📍 {geotopic.location_name}</span>
					<span>📝 {geotopic.post_count} posts</span>
					<span>🏷️ {geotopic.topic}</span>
				</div>
			</div>

			<!-- Post form -->
			<EngramFormCard
				onSubmit={addNewEngram}
				initialGeotopics={geotopic ? [geotopic] : []}
				class="mb-10"
			/>

			<!-- Top posts in this geotopic -->
			{#if topPosts.length > 0}
				<div class="mb-8">
					<h2 class="mb-4 text-lg font-semibold">🔥 Trending here this week</h2>
					<div class="grid gap-3 md:grid-cols-2">
						{#each topPosts as post, i}
							<div
								class="rounded-[1.5rem] border border-white/40 bg-white/60 p-4 shadow-xl backdrop-blur-xl transition-all hover:bg-white/70 hover:shadow-2xl"
							>
								<div class="flex items-start gap-3">
									<span class="text-lg font-bold text-[hsl(var(--muted-foreground))]">#{i + 1}</span
									>
									<div class="flex-1">
										<p class="text-sm leading-relaxed text-[hsl(var(--foreground))]">
											{post.content}
										</p>
										<div
											class="mt-2 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"
										>
											<span>👍 {post.upvotes - post.downvotes}</span>
											<span>{post.weekly_score} pts</span>
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- All posts -->
			<div class="mb-6">
				<h2 class="mb-4 text-lg font-semibold">Recent Posts</h2>
				<p class="text-xs text-[hsl(var(--muted-foreground))]">{engrams.length} total</p>
			</div>

			<div class="grid gap-6 md:grid-cols-2">
				{#each engrams as engram (engram.id)}
					<Card>
						{#snippet children()}
							<div class="px-5 pt-5 pb-3">
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
									{geotopic?.location_name}
								</span>
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

										<div class="flex items-center gap-2">
											<p class="text-xs text-[hsl(var(--muted-foreground))]">
												{new Date(engram.createdAt).toLocaleDateString()}
											</p>
										</div>
									</div>
								{/snippet}
							</CardFooter>
						{/snippet}
					</Card>
				{/each}
			</div>
		</div>
	{/if}
</main>
