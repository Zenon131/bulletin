<script lang="ts">
	import { onMount } from 'svelte';
	import { leaderboardService } from '$lib/services/leaderboardService.js';
	import { supabaseService } from '$lib/services/supabaseService.js';
	import type { Engram } from '$lib/types/index.js';
	import { VoteControls } from '$lib/components/index.js';

	let leaderboard = $state<Engram[]>([]);
	let loading = $state(true);
	let lastUpdated = $state(new Date());

	async function loadLeaderboard() {
		loading = true;
		try {
			const data = await leaderboardService.getWeeklyLeaderboard(100);
			leaderboard = data;
			lastUpdated = new Date();
		} catch (error) {
			console.error('Error loading leaderboard:', error);
		} finally {
			loading = false;
		}
	}

	onMount(loadLeaderboard);

	async function handleVote(id: number, direction: 'up' | 'down') {
		try {
			const updated = await supabaseService.voteEngram(id, direction);
			if (updated) {
				leaderboard = leaderboard.map((engram) => (engram.id === id ? updated : engram));
			}
		} catch (error) {
			console.error('Error voting:', error);
		}
	}

	function getRankColor(rank: number): string {
		if (rank <= 3) return 'text-black';
		return 'text-[hsl(var(--muted-foreground))]';
	}

	function getRankBg(rank: number): string {
		if (rank <= 3) return 'border-black/20 bg-white/80';
		return '';
	}
</script>

<svelte:head>
	<title>Weekly Leaderboard — Bulletin</title>
	<meta name="description" content="Top 100 posts on Bulletin this week." />
</svelte:head>

<main class="container mx-auto mt-14 px-4 py-8">
	<div class="mx-auto max-w-4xl">
		<div class="mb-10 text-center">
			<h1 class="mb-2 text-3xl font-bold">🏆 Weekly Leaderboard</h1>
			<p class="text-[hsl(var(--muted-foreground))]">
				The top 100 posts across all of Bulletin this week.
			</p>
			<p class="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
				Updated {lastUpdated.toLocaleTimeString()}
				<button onclick={loadLeaderboard} class="ml-2 font-medium text-black hover:underline">
					Refresh
				</button>
			</p>
		</div>

		{#if loading}
			<div class="py-12 text-center">
				<div class="text-[hsl(var(--muted-foreground))]">Loading leaderboard...</div>
			</div>
		{:else if leaderboard.length === 0}
			<div class="py-12 text-center">
				<div class="mb-2 text-[hsl(var(--muted-foreground))]">No posts this week yet.</div>
				<p class="text-sm text-[hsl(var(--muted-foreground))]">
					Be the first to post and make it to the leaderboard!
				</p>
			</div>
		{:else}
			<div class="space-y-3">
				{#each leaderboard as post, i}
					<div
						class="rounded-[1.5rem] border border-white/40 bg-white/60 p-4 shadow-xl backdrop-blur-xl transition-all hover:bg-white/70 hover:shadow-2xl {getRankBg(
							i + 1
						)}"
					>
						<div class="flex items-start gap-4">
							<div class="w-12 flex-shrink-0 text-center">
								<div class="text-2xl font-bold {getRankColor(i + 1)}">
									#{i + 1}
								</div>
								<div class="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
									{post.weekly_score} pts
								</div>
							</div>

							<div class="min-w-0 flex-1">
								<p class="mb-1 text-[15px] leading-relaxed">{post.content}</p>

								<div
									class="mt-2 flex items-center gap-4 text-xs text-[hsl(var(--muted-foreground))]"
								>
									{#if post.geotopic}
										<a
											href={`/geotopic/${post.geotopic.slug}`}
											class="font-medium text-black hover:underline"
										>
											📍 {post.geotopic.name}
										</a>
									{:else if post.location_name}
										<span>📍 {post.location_name}</span>
									{/if}

									<span>{new Date(post.createdAt).toLocaleDateString()}</span>
								</div>
							</div>

							<div class="flex-shrink-0">
								<VoteControls
									upvotes={post.upvotes}
									downvotes={post.downvotes}
									userVote={post.userVote}
									onVote={(direction) => handleVote(post.id, direction)}
								/>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</main>
