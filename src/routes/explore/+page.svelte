<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { onMount } from 'svelte';
	import { geotopicService } from '$lib/services/geotopicService.js';
	import { aiSuggester } from '$lib/services/aiSuggester.js';
	import { supabaseService } from '$lib/services/supabaseService.js';
	import type { Geotopic, Engram } from '$lib/types/index.js';

	let geotopics = $state<Geotopic[]>([]);
	let recentGeotopics = $state<Geotopic[]>([]);
	let loading = $state(true);
	let searchLocation = $state('');
	let searchTopic = $state('');
	let activeTab = $state<'all' | 'user' | 'ai'>('all');
	let recentPosts = $state<Engram[]>([]);
	let aiDiscoveries = $state<ReturnType<typeof aiSuggester.discoverFromPosts>>([]);

	let searchDebounce: ReturnType<typeof setTimeout> | null = null;

	async function loadData() {
		loading = true;
		const [topics, fresh, { posts }] = await Promise.all([
			geotopicService.getGeotopics({
				location: searchLocation || undefined,
				topic: searchTopic || undefined,
				limit: 50
			}),
			geotopicService.getGeotopics({
				recent: true,
				limit: 8
			}),
			supabaseService.getEngrams(undefined, undefined, 20)
		]);
		geotopics = topics;
		recentGeotopics = fresh;
		recentPosts = posts;

		aiDiscoveries = aiSuggester.discoverFromPosts(
			recentPosts.map((p) => ({ title: p.title, content: p.content }))
		);

		loading = false;
	}

	function debouncedLoadData() {
		if (searchDebounce) clearTimeout(searchDebounce);
		searchDebounce = setTimeout(loadData, 400);
	}

	onMount(loadData);

	const filteredGeotopics = $derived(
		geotopics.filter((g) => {
			if (activeTab === 'user') return g.created_by === 'user';
			if (activeTab === 'ai') return g.created_by === 'ai';
			return true;
		})
	);

	async function createFromAiSuggestion(suggestion: (typeof aiDiscoveries)[number]) {
		const created = await geotopicService.createGeotopic({
			name: suggestion.name,
			location_name: suggestion.location_name,
			topic: suggestion.topic,
			created_by: 'ai'
		});

		if (created) {
			await loadData();
		}
	}
</script>

<svelte:head>
	<title>Explore Geotopics — Bulletin</title>
</svelte:head>

<main class="container mx-auto mt-14 px-4 py-8">
	<div class="mx-auto max-w-5xl">
		<div class="mb-10 text-center">
			<h1 class="mb-2 text-3xl font-bold">Explore Geotopics</h1>
			<p class="text-[hsl(var(--muted-foreground))]">
				Discover hyper-local communities around the world
			</p>
		</div>

		<!-- Search filters -->
		<div class="mb-8 flex flex-col gap-3 sm:flex-row">
			<div class="flex-1">
				<div
					class="flex items-center gap-2 rounded-full border border-white/40 bg-white/60 px-4 py-2 shadow-xl backdrop-blur-xl focus-within:border-black/20"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4 text-[hsl(var(--muted-foreground))]"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
						<circle cx="12" cy="10" r="3" />
					</svg>
					<input
						type="text"
						placeholder="Filter by location..."
						bind:value={searchLocation}
						oninput={debouncedLoadData}
						class="w-full border-none bg-transparent text-sm placeholder:text-black/40 focus:outline-none"
					/>
				</div>
			</div>
			<div class="flex-1">
				<div
					class="flex items-center gap-2 rounded-full border border-white/40 bg-white/60 px-4 py-2 shadow-xl backdrop-blur-xl focus-within:border-black/20"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4 text-[hsl(var(--muted-foreground))]"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<circle cx="11" cy="11" r="8" />
						<path d="m21 21-4.3-4.3" />
					</svg>
					<input
						type="text"
						placeholder="Filter by topic..."
						bind:value={searchTopic}
						oninput={debouncedLoadData}
						class="w-full border-none bg-transparent text-sm placeholder:text-black/40 focus:outline-none"
					/>
				</div>
			</div>
		</div>

		<!-- Tabs -->
		<div class="mb-6 flex gap-1">
			<button
				onclick={() => (activeTab = 'all')}
				class={cn(
					'relative rounded-full px-4 py-2 text-sm font-medium transition-colors',
					activeTab === 'all'
						? 'bg-black text-white'
						: 'text-muted-foreground hover:bg-black/5 hover:text-black'
				)}
			>
				All
			</button>
			<button
				onclick={() => (activeTab = 'user')}
				class={cn(
					'relative rounded-full px-4 py-2 text-sm font-medium transition-colors',
					activeTab === 'user'
						? 'bg-black text-white'
						: 'text-muted-foreground hover:bg-black/5 hover:text-black'
				)}
			>
				Community
			</button>
			<button
				onclick={() => (activeTab = 'ai')}
				class={cn(
					'relative rounded-full px-4 py-2 text-sm font-medium transition-colors',
					activeTab === 'ai'
						? 'bg-black text-white'
						: 'text-muted-foreground hover:bg-black/5 hover:text-black'
				)}
			>
				AI-Generated
			</button>
		</div>

		<!-- AI Discoveries -->
		{#if aiDiscoveries.length > 0 && activeTab === 'all'}
			<div class="mb-10">
				<h2 class="mb-4 flex items-center gap-2 text-lg font-semibold">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5 text-black"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M12 2a10 10 0 1 0 10 10H12V2z" />
						<path d="M12 2a10 10 0 0 1 10 10" />
						<path d="M12 12 2.1 10.5" />
					</svg>
					AI Discovered Topics
				</h2>
				<p class="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
					Based on what people are posting about, our AI suggests these new geotopics.
				</p>
				<div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
					{#each aiDiscoveries.slice(0, 6) as suggestion}
						<div
							class="rounded-[1.5rem] border border-white/40 bg-white/60 p-4 shadow-xl backdrop-blur-xl transition-all hover:bg-white/70 hover:shadow-2xl"
						>
							<div class="flex items-start justify-between">
								<div>
									<h3 class="font-medium">{suggestion.name}</h3>
									<p class="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
										Confidence: {Math.round(suggestion.confidence * 100)}%
									</p>
								</div>
								<button
									onclick={() => createFromAiSuggestion(suggestion)}
									class="rounded-full bg-black px-3 py-1.5 text-xs font-medium text-white transition-all hover:brightness-110 active:scale-[0.97]"
								>
									Create
								</button>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Freshly Created -->
		{#if recentGeotopics.length > 0}
			<div class="mb-10">
				<h2 class="mb-4 flex items-center gap-2 text-lg font-semibold">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5 text-black"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M12 8v4l3 3" />
						<circle cx="12" cy="12" r="10" />
					</svg>
					Freshly Created
				</h2>
				<p class="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
					The newest communities on Bulletin — be the first to post.
				</p>
				<div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
					{#each recentGeotopics as geotopic}
						<a href={`/geotopic/${geotopic.slug}`} class="group block">
							<div
								class="rounded-[1.5rem] border border-white/40 bg-white/60 p-4 shadow-xl backdrop-blur-xl transition-all hover:border-black/20 hover:bg-white/70 hover:shadow-2xl"
							>
								<div class="mb-1 flex items-start justify-between">
									<h3 class="font-medium transition-colors group-hover:text-black">
										{geotopic.name}
									</h3>
									{#if geotopic.created_by === 'ai'}
										<span
											class="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-medium text-black"
											>AI</span
										>
									{/if}
								</div>
								<div class="flex items-center gap-3 text-xs text-[hsl(var(--muted-foreground))]">
									<span class="inline-flex items-center gap-1">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-3 w-3"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
											<circle cx="12" cy="10" r="3" />
										</svg>
										{geotopic.location_name}
									</span>
									<span>📝 {geotopic.post_count} posts</span>
								</div>
							</div>
						</a>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Geotopics grid -->
		{#if loading}
			<div class="py-12 text-center">
				<div class="text-[hsl(var(--muted-foreground))]">Loading geotopics...</div>
			</div>
		{:else if filteredGeotopics.length === 0}
			<div class="py-12 text-center">
				<div class="mb-2 text-[hsl(var(--muted-foreground))]">No geotopics found.</div>
				<p class="text-sm text-[hsl(var(--muted-foreground))]">
					Try a different search or create one from the home page.
				</p>
			</div>
		{:else}
			<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{#each filteredGeotopics as geotopic}
					<a href={`/geotopic/${geotopic.slug}`} class="group block">
						<div
							class="rounded-[1.5rem] border border-white/40 bg-white/60 p-5 shadow-xl backdrop-blur-xl transition-all hover:border-black/20 hover:bg-white/70 hover:shadow-2xl"
						>
							<div class="mb-2 flex items-start justify-between">
								<h3 class="font-semibold transition-colors group-hover:text-black">
									{geotopic.name}
								</h3>
								{#if geotopic.created_by === 'ai'}
									<span
										class="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-medium text-black"
										>AI</span
									>
								{/if}
							</div>

							{#if geotopic.description}
								<p class="mb-3 line-clamp-2 text-sm text-[hsl(var(--muted-foreground))]">
									{geotopic.description}
								</p>
							{/if}

							<div class="flex items-center gap-3 text-xs text-[hsl(var(--muted-foreground))]">
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
									{geotopic.location_name}
								</span>
								<span>📝 {geotopic.post_count} posts</span>
								{#if geotopic.weekly_score > 0}
									<span class="font-medium text-black">🔥 {geotopic.weekly_score}</span>
								{/if}
							</div>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</div>
</main>
