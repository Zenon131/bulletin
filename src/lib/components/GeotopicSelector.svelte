<script lang="ts">
	import { onMount } from 'svelte';
	import { cn } from '$lib/utils.js';
	import { aiSuggester } from '$lib/services/aiSuggester.js';
	import { locationService } from '$lib/services/locationService.js';
	import { geotopicService } from '$lib/services/geotopicService.js';
	import type { Geotopic, ResolvedGeotopic } from '$lib/types/index.js';

	interface Props {
		content: string;
		initialGeotopics?: Geotopic[];
		locationHint?: string;
		history?: Record<number, number>;
		selectedGeotopicId?: number;
		locationName?: string;
		onSelect: (geotopic: Geotopic | null, loc: string) => void;
		class?: string;
	}

	let {
		content,
		initialGeotopics = [],
		locationHint = '',
		history = {},
		selectedGeotopicId,
		locationName: initialLocation = '',
		onSelect,
		class: className
	}: Props = $props();

	// --- Unified geotopic cache ---
	// The `initialGeotopics` prop may only contain 8 trending items from the parent.
	// We maintain our own full cache fetched directly from Supabase so the AI
	// matcher and manual search both see every geotopic that exists.
	let localGeotopics = $state<Geotopic[]>([]);
	let cacheLoading = $state(false);

	async function refreshGeotopics() {
		cacheLoading = true;
		const fresh = await geotopicService.getGeotopics({ limit: 500 });
		localGeotopics = fresh;
		cacheLoading = false;
	}

	// Seed from prop once on mount, then pull the full list.
	// Using $effect for this was wiping the cache every time the parent
	// re-rendered and passed a new array reference for initialGeotopics.
	onMount(() => {
		localGeotopics = initialGeotopics;
		refreshGeotopics();
	});

	let isAnalyzing = $state(false);
	let resolved = $state<ResolvedGeotopic | null>(null);
	let selectedGeotopic = $state<Geotopic | null>(null);
	let locationName = $state(initialLocation);
	let showManual = $state(false);
	let manualSearch = $state('');
	let manualResults = $state<Geotopic[]>([]);
	let manualOpen = $state(false);
	let manualLoading = $state(false);
	let showCreateNew = $state(false);
	let creating = $state(false);
	let createError = $state('');
	let pendingCreate = $state(false);

	// Timer handles — must be plain variables, NOT $state, or the $effect that
	// reads them will re-fire every time they are written, causing an
	// infinite loop (effect_update_depth_exceeded).
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let manualDebounce: ReturnType<typeof setTimeout> | null = null;

	let analysisGeneration = 0;
	let lastAnalyzedText = '';

	// When content changes, debounce and run analysis
	$effect(() => {
		const trimmed = content.trim();
		// Don't analyze empty or very short text
		if (!trimmed || trimmed.length < 10) {
			if (debounceTimer) clearTimeout(debounceTimer);
			resolved = null;
			isAnalyzing = false;
			lastAnalyzedText = '';
			return;
		}
		// Skip if text hasn't meaningfully changed
		if (trimmed === lastAnalyzedText) return;

		if (debounceTimer) clearTimeout(debounceTimer);
		const currentGen = ++analysisGeneration;
		debounceTimer = setTimeout(async () => {
			lastAnalyzedText = trimmed;
			isAnalyzing = true;
			await runAnalysis(currentGen);
			if (currentGen === analysisGeneration) isAnalyzing = false;
		}, 600);
	});

	// If parent passes a selectedGeotopicId, resolve it locally against our cache
	$effect(() => {
		if (selectedGeotopicId) {
			const found = localGeotopics.find((g) => g.id === selectedGeotopicId);
			if (found) selectedGeotopic = found;
		}
	});

	async function runAnalysis(expectedGen: number) {
		if (!content.trim()) return;
		const title = content.slice(0, 60);
		const result = await aiSuggester.resolveGeotopic(
			title,
			content,
			localGeotopics,
			locationHint || locationName || undefined,
			history
		);
		// Ignore stale results if a newer analysis started while we were in-flight
		if (expectedGen !== analysisGeneration) return;
		resolved = result;
		showManual = result.action === 'manual';
		// Don't wipe the create-new banner if the user already clicked
		// "Create" on a previous suggestion and is still deciding.
		if (!pendingCreate) {
			showCreateNew = false;
		}

		if (result.action === 'assign' && result.geotopic) {
			selectedGeotopic = result.geotopic;
			locationName = result.geotopic.location_name;
			onSelect(result.geotopic, result.geotopic.location_name);
		}
	}

	function acceptSuggestion() {
		createError = '';
		if (resolved?.geotopic) {
			selectedGeotopic = resolved.geotopic;
			locationName = resolved.geotopic.location_name;
			onSelect(resolved.geotopic, resolved.geotopic.location_name);
			resolved = null;
		} else if (resolved?.suggested) {
			// New geotopic — show create flow
			showCreateNew = true;
			pendingCreate = true;
		}
	}

	function dismissSuggestion() {
		resolved = null;
		showManual = true;
		showCreateNew = false;
		pendingCreate = false;
		createError = '';
	}

	function dismissAuto() {
		resolved = null;
		selectedGeotopic = null;
		showManual = true;
		onSelect(null, '');
	}

	function selectChoice(geotopic: Geotopic) {
		selectedGeotopic = geotopic;
		locationName = geotopic.location_name;
		onSelect(geotopic, geotopic.location_name);
		resolved = null;
		showManual = false;
	}

	async function createAndAccept() {
		if (!resolved?.suggested || creating) return;
		createError = '';
		creating = true;
		const s = resolved.suggested;

		// Check if a geotopic with this slug already exists in our cache.
		// This avoids a silent unique-constraint failure from Supabase.
		const slug = s.name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
		const existing = localGeotopics.find((g) => g.slug === slug);
		if (existing) {
			creating = false;
			selectedGeotopic = existing;
			locationName = existing.location_name;
			onSelect(existing, existing.location_name);
			resolved = null;
			showCreateNew = false;
			pendingCreate = false;
			return;
		}

		const created = await geotopicService.createGeotopic({
			name: s.name,
			location_name: s.location_name,
			topic: s.topic,
			created_by: 'ai',
			status: 'emerging'
		});
		creating = false;
		if (created) {
			// Add to our unified cache so it's immediately findable everywhere
			localGeotopics = [created, ...localGeotopics];
			selectedGeotopic = created;
			locationName = created.location_name;
			onSelect(created, created.location_name);
			resolved = null;
			showCreateNew = false;
			pendingCreate = false;
		} else {
			createError = 'Could not create geotopic. It may already exist.';
		}
	}

	function clearSelection() {
		selectedGeotopic = null;
		locationName = '';
		resolved = null;
		onSelect(null, '');
	}

	async function searchManual() {
		if (!manualSearch.trim()) {
			manualResults = [];
			return;
		}
		manualLoading = true;
		const results = await geotopicService.getGeotopics({
			search: manualSearch,
			limit: 8
		});
		manualResults = results;
		manualLoading = false;
	}

	function selectManual(geotopic: Geotopic) {
		selectedGeotopic = geotopic;
		locationName = geotopic.location_name;
		onSelect(geotopic, geotopic.location_name);
		manualOpen = false;
		showManual = false;
	}

	async function detectLocation() {
		const resolved = await locationService.resolveLocation();
		if (resolved) {
			locationName = resolved.name;
		}
	}

	// Debounced manual search
	function onManualInput() {
		if (manualDebounce) clearTimeout(manualDebounce);
		manualDebounce = setTimeout(searchManual, 200);
	}
</script>

<div class={cn('relative flex flex-col gap-2', className)}>
	<!-- Location chip + selected geotopic chip -->
	<div class="flex flex-wrap items-center gap-2">
		{#if locationName}
			<button
				onclick={() => {
					locationName = '';
				}}
				class="inline-flex items-center gap-1 rounded-full bg-black/5 px-2.5 py-1 text-xs font-medium text-black/70 transition-colors hover:bg-black/10"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-3.5 w-3.5"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
					<circle cx="12" cy="10" r="3" />
				</svg>
				{locationName}
			</button>
		{:else}
			<button
				onclick={detectLocation}
				class="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs font-medium transition-colors {content.trim() &&
				!locationName
					? 'animate-pulse border-black/40 bg-black/5 text-black'
					: 'border-black/20 text-black/50 hover:border-black/40 hover:text-black'}"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-3.5 w-3.5"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
					<circle cx="12" cy="10" r="3" />
				</svg>
				Detect location
			</button>
		{/if}

		{#if selectedGeotopic}
			<span
				class="inline-flex items-center gap-1 rounded-full bg-black px-2.5 py-1 text-xs font-medium text-white"
			>
				{selectedGeotopic.name}
				<button
					onclick={clearSelection}
					class="ml-0.5 transition-colors hover:text-white/70"
					aria-label="Clear"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-3 w-3"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M18 6 6 18" />
						<path d="m6 6 12 12" />
					</svg>
				</button>
			</span>
		{/if}
	</div>

	{#if content.trim() && !locationName}
		<p class="text-xs text-black/60">Add a location so people nearby can see your post.</p>
	{/if}

	<!-- Auto-assign chip (confidence >= 0.90) -->
	{#if resolved?.action === 'assign' && resolved.geotopic}
		<div
			class="flex items-center gap-2 rounded-[1.5rem] border border-white/40 bg-white/60 px-3 py-2 text-sm shadow-xl backdrop-blur-xl"
		>
			<span class="text-[hsl(var(--muted-foreground))]">Filed under</span>
			<span class="font-medium">{resolved.geotopic.name}</span>
			<button
				onclick={dismissAuto}
				class="ml-auto text-[hsl(var(--muted-foreground))] transition-colors hover:text-black"
				aria-label="Dismiss"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-3.5 w-3.5"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M18 6 6 18" />
					<path d="m6 6 12 12" />
				</svg>
			</button>
		</div>
	{/if}

	<!-- Suggestion banner (0.60 – 0.89) -->
	{#if resolved?.action === 'suggest'}
		<div
			class="flex items-center gap-2 rounded-[1.5rem] border border-white/40 bg-white/60 px-3 py-2 text-sm shadow-xl backdrop-blur-xl"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4 shrink-0 text-black"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
				<circle cx="12" cy="10" r="3" />
			</svg>
			<span class="text-[hsl(var(--muted-foreground))]"
				>{#if resolved.suggested?.topic === 'General'}📍{:else}🧠{/if}
				{resolved.suggested?.name ?? resolved.geotopic?.name}</span
			>
			<span class="ml-auto flex items-center gap-1">
				<button
					onclick={acceptSuggestion}
					class="rounded-full bg-black px-2 py-0.5 text-xs font-medium text-white transition-all hover:brightness-110 active:scale-[0.97]"
					aria-label="Accept"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-3.5 w-3.5"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M20 6 9 17l-5-5" />
					</svg>
				</button>
				<button
					onclick={dismissSuggestion}
					class="rounded-full px-2 py-0.5 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:text-black"
					aria-label="Dismiss"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-3.5 w-3.5"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M18 6 6 18" />
						<path d="m6 6 12 12" />
					</svg>
				</button>
			</span>
		</div>
	{/if}

	<!-- Create new geotopic confirmation -->
	{#if showCreateNew && resolved?.suggested}
		<div
			class="flex flex-col gap-2 rounded-[1.5rem] border border-white/40 bg-white/60 px-3 py-2 text-sm shadow-xl backdrop-blur-xl"
		>
			<div class="flex items-center gap-2">
				<span class="text-[hsl(var(--muted-foreground))]">Create new geotopic:</span>
				<span class="font-medium">{resolved.suggested.name}</span>
				<button
					onclick={createAndAccept}
					disabled={creating}
					class="ml-auto rounded-full bg-black px-3 py-1 text-xs font-medium text-white transition-all hover:brightness-110 active:scale-[0.97] disabled:opacity-40"
				>
					{creating ? 'Creating...' : 'Create ✓'}
				</button>
				<button
					onclick={() => {
						showCreateNew = false;
						pendingCreate = false;
						createError = '';
					}}
					class="rounded-full px-2 py-1 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:text-black"
				>
					Cancel
				</button>
			</div>
			{#if createError}
				<p class="text-xs text-red-600">{createError}</p>
			{/if}
		</div>
	{/if}

	<!-- Offer choices (0.40 – 0.59) -->
	{#if resolved?.action === 'offer_choices' && resolved.choices && resolved.choices.length > 0}
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-xs text-[hsl(var(--muted-foreground))]">Which one?</span>
			{#each resolved.choices as choice}
				<button
					onclick={() => selectChoice(choice.geotopic)}
					class="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/80 transition-colors hover:bg-black hover:text-white"
				>
					{choice.geotopic.name}
				</button>
			{/each}
			{#if resolved.is_new && resolved.suggested}
				<button
					onclick={() => (showCreateNew = true)}
					class="rounded-full border border-dashed border-black/30 px-3 py-1 text-xs font-medium text-black/60 transition-colors hover:border-black/60 hover:text-black"
				>
					Create "{resolved.suggested.name}"
				</button>
			{/if}
			<button
				onclick={() => (showManual = true)}
				class="text-xs text-[hsl(var(--muted-foreground))] underline transition-colors hover:text-black"
			>
				Can't find it?
			</button>
		</div>
	{/if}

	<!-- Manual selector -->
	{#if showManual || resolved?.action === 'manual'}
		<div class="flex flex-col gap-2">
			<div class="relative">
				<input
					type="text"
					placeholder="Search geotopics..."
					bind:value={manualSearch}
					oninput={onManualInput}
					onfocus={() => (manualOpen = true)}
					class="w-full rounded-full border border-white/40 bg-white/60 px-4 py-2 text-sm shadow-xl backdrop-blur-xl placeholder:text-black/40 focus:border-black/20 focus:outline-none"
				/>
				{#if manualOpen}
					<div
						class="absolute z-20 mt-1 w-full overflow-hidden rounded-[1.5rem] border border-white/40 bg-white/80 shadow-2xl backdrop-blur-2xl"
					>
						{#if manualLoading}
							<div class="p-3 text-sm text-[hsl(var(--muted-foreground))]">Loading...</div>
						{:else if manualResults.length === 0 && manualSearch.trim()}
							<div class="p-3 text-sm text-[hsl(var(--muted-foreground))]">No geotopics found.</div>
						{:else}
							{#each manualResults as geotopic}
								<button
									onclick={() => selectManual(geotopic)}
									class="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-black/5"
								>
									<div class="flex items-center gap-2">
										<span class="font-medium">{geotopic.name}</span>
										{#if geotopic.created_by === 'ai'}
											<span class="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] text-black"
												>AI</span
											>
										{/if}
									</div>
									<div class="text-xs text-[hsl(var(--muted-foreground))]">
										{geotopic.post_count} posts
									</div>
								</button>
							{/each}
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Analyzing spinner -->
	{#if isAnalyzing}
		<div class="flex items-center gap-2 px-1 py-1 text-xs text-[hsl(var(--muted-foreground))]">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4 animate-spin"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
				<path
					class="opacity-75"
					d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					fill="currentColor"
				/>
			</svg>
			Analyzing...
		</div>
	{/if}
</div>

<!-- Click outside to close manual dropdown -->
<svelte:window
	onclick={(e) => {
		const target = e.target as HTMLElement;
		if (!target.closest('.relative')) {
			manualOpen = false;
		}
	}}
/>
