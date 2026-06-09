<script lang="ts">
	import { Card, CardContent } from '$lib/components/index.js';
	import GeotopicSelector from './GeotopicSelector.svelte';
	import { locationService } from '$lib/services/locationService.js';
	import { userHistoryService } from '$lib/services/userHistoryService.js';
	import { cn } from '$lib/utils.js';
	import type { Geotopic } from '$lib/types/index.js';

	import { contentFilter } from '$lib/services/contentFilter.js';

	interface Props {
		onSubmit: (
			title: string,
			content: string,
			geotopic_id?: number,
			location_name?: string
		) => void;
		class?: string;
		initialGeotopics?: Geotopic[];
	}

	let { onSubmit, class: className, initialGeotopics = [] }: Props = $props();

	let content = $state('');
	let selectedGeotopic = $state<Geotopic | null>(null);
	let locationName = $state('');
	let locationHint = $state('');
	let submitError = $state('');
	let contentWarning = $state('');

	function handleGeotopicSelect(geotopic: Geotopic | null, loc: string) {
		selectedGeotopic = geotopic;
		locationName = loc;
		if (loc) locationService.setRecentPostLocation(loc);
	}

	async function resolveLocation() {
		const resolved = await locationService.resolveLocation();
		if (resolved) {
			locationHint = resolved.name;
			locationName = resolved.name;
		}
	}

	resolveLocation();

	function generateTitle(text: string): string {
		const cleaned = text.replace(/\s+/g, ' ').trim();
		const words = cleaned.split(' ');
		if (words.length <= 6) return cleaned;
		return words.slice(0, 6).join(' ') + '...';
	}

	function handleSubmit() {
		if (!content.trim()) return;

		const filterResult = contentFilter.check(content);
		if (!filterResult.clean) {
			submitError = `This post contains inappropriate language (${filterResult.matched}). Please revise.`;
			return;
		}

		const effectiveLocation = locationName || selectedGeotopic?.location_name;
		if (!effectiveLocation) {
			submitError = 'Add a location so people nearby can see your post.';
			return;
		}
		submitError = '';
		contentWarning = '';

		try {
			const title = generateTitle(content);
			onSubmit(title, content, selectedGeotopic?.id, effectiveLocation);

			content = '';
			selectedGeotopic = null;
			locationName = '';
		} catch (error) {
			console.error('Error submitting form:', error);
		}
	}

	// Real-time content filter check as user types
	$effect(() => {
		if (!content.trim()) {
			contentWarning = '';
			return;
		}
		const result = contentFilter.check(content);
		if (!result.clean) {
			contentWarning = `Inappropriate language detected: "${result.matched}". Please revise.`;
		} else {
			contentWarning = '';
		}
	});
</script>

<Card
	class={cn(
		'relative overflow-hidden rounded-[1.75rem] border border-white/50 bg-white/70 shadow-2xl backdrop-blur-2xl',
		className
	)}
>
	<form
		class="flex flex-col"
		action="/"
		onsubmit={(e) => {
			e.preventDefault();
			handleSubmit();
		}}
	>
		<CardContent class="relative space-y-3 px-5 pt-4 pb-16">
			<textarea
				placeholder="What's happening around you?"
				bind:value={content}
				class="placeholder:text-muted-foreground/40 min-h-20 w-full resize-none border-none bg-transparent text-base leading-relaxed focus:ring-0 focus:outline-none"
			></textarea>

			<GeotopicSelector
				{content}
				{initialGeotopics}
				{locationHint}
				history={userHistoryService.getCounts()}
				selectedGeotopicId={selectedGeotopic?.id}
				{locationName}
				onSelect={handleGeotopicSelect}
			/>

			{#if contentWarning}
				<p class="text-xs text-amber-600">{contentWarning}</p>
			{/if}

			{#if submitError}
				<p class="text-xs text-red-600">{submitError}</p>
			{/if}

			<button
				type="submit"
				aria-label="Post"
				disabled={!!contentWarning}
				class="absolute right-5 bottom-4 z-10 flex h-10 w-10 items-center justify-center rounded-full text-white  shadow-2xl transition-all duration-200 hover:brightness-110 active:scale-90 {content.trim() &&
				!contentWarning
					? 'translate-y-0 bg-transparent opacity-100'
					: 'pointer-events-none translate-y-2 bg-black/30 opacity-0'}"
			>
				<img src="/bulletin logo.svg" alt="Bulletin logo" class="h-5 w-5" />
			</button>
		</CardContent>
	</form>
</Card>
