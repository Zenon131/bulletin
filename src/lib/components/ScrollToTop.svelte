<script lang="ts">
	import { browser } from '$app/environment';
	import { cn } from '$lib/utils.js';
	import { onMount } from 'svelte';

	let visible = $state(false);

	let ticking = false;
	function updateVisibility() {
		if (!browser || ticking) return;
		ticking = true;
		requestAnimationFrame(() => {
			visible = window.scrollY > 400;
			ticking = false;
		});
	}

	function scrollToTop() {
		if (!browser) return;
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	onMount(() => {
		updateVisibility();
		window.addEventListener('scroll', updateVisibility, { passive: true });
		return () => window.removeEventListener('scroll', updateVisibility);
	});
</script>

<button
	type="button"
	aria-label="Scroll to top"
	onclick={scrollToTop}
	class={cn(
		'fixed right-6 bottom-6 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-black text-white shadow-lg transition-all duration-200 hover:brightness-110 active:scale-90',
		visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
	)}
>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		class="h-5 w-5"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2.5"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d="m18 15-6-6-6 6" />
	</svg>
</button>
