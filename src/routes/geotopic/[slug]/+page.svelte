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
	let postError = $state('');
	let hasMore = $state(false);
	let loadingMore = $state(false);
	const PAGE_SIZE = 50;

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

			const [{ posts, hasMore: more }, trending] = await Promise.all([
				supabaseService.getEngrams(undefined, topic.id, PAGE_SIZE, 0),
				leaderboardService.getWeeklyLeaderboard(10)
			]);

			engrams = posts;
			hasMore = more;
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
		location_name?: string,
		contact_info?: string
	) {
		if (!geotopic) return null;

		const filterResult = contentFilter.check(content);
		if (!filterResult.clean) {
			postError = `This post contains inappropriate language (${filterResult.matched}). Please revise.`;
			return null;
		}
		postError = '';

		const newEngram = await supabaseService.addEngram({
			title,
			content,
			geotopic_id: geotopic.id,
			location_name: location_name || geotopic.location_name,
			contact_info
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

	async function loadMore() {
		if (loadingMore || !hasMore || !geotopic) return;
		loadingMore = true;
		try {
			const { posts, hasMore: more } = await supabaseService.getEngrams(
				undefined,
				geotopic.id,
				PAGE_SIZE,
				engrams.length
			);
			engrams = [...engrams, ...posts];
			hasMore = more;
		} catch (error) {
			console.error('Error loading more posts:', error);
		} finally {
			loadingMore = false;
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
			{#if postError}
				<p class="-mt-6 mb-8 text-xs text-red-600">{postError}</p>
			{/if}

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
											<p class="text-xs text-[hsl(var(--muted-foreground))]">
												{new Date(engram.createdAt).toLocaleDateString()}
											</p>
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
					<p class="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
						Showing {engrams.length} posts
					</p>
				</div>
			{/if}
		</div>
	{/if}
</main>
