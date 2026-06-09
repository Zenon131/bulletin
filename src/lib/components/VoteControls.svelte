<script lang="ts">
	import { cn } from '$lib/utils.js';

	interface Props {
		upvotes: number;
		downvotes: number;
		userVote?: 'up' | 'down' | null;
		onVote: (direction: 'up' | 'down') => void;
		class?: string;
	}

	let { upvotes, downvotes, userVote, onVote, class: className }: Props = $props();

	// Get the total votes (can be positive or negative)
	let totalScore = $derived(upvotes - downvotes);

	// Determine score color based on total
	let scoreColor = $derived(totalScore === 0 ? 'text-muted-foreground' : 'text-foreground');
</script>

<div class={cn('flex items-center space-x-2', className)}>
	<!-- Upvote button -->
	<button
		class={cn(
			'rounded-full p-1 transition-colors hover:bg-black/5',
			userVote === 'up' ? 'text-black' : 'text-[hsl(var(--muted-foreground))]'
		)}
		onclick={() => onVote('up')}
		aria-label="Upvote"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="lucide lucide-arrow-up"><path d="m12 19-7-7 7-7" /></svg
		>
	</button>

	<!-- Vote count -->
	<span class={cn('text-sm font-medium', scoreColor)}>
		{totalScore}
	</span>

	<!-- Downvote button -->
	<button
		class={cn(
			'rounded-full p-1 transition-colors hover:bg-black/5',
			userVote === 'down' ? 'text-black' : 'text-[hsl(var(--muted-foreground))]'
		)}
		onclick={() => onVote('down')}
		aria-label="Downvote"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="lucide lucide-arrow-down"><path d="m12 5 7 7-7 7" /></svg
		>
	</button>
</div>
