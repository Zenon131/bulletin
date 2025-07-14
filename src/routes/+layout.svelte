<script lang="ts">
	import '../app.css';
	import Navbar from '$lib/components/Navbar.svelte';
	import Footer from '$lib/components/Footer.svelte';

	// Props for this layout component
	let { children, data } = $props();
	
	// Default title that can be overridden by individual pages
	let title = 'Bulletin';
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content="Share your thoughts with the community!" />
</svelte:head>

<div class="flex min-h-screen flex-col">
	<Navbar />
	<main class="flex-grow pt-16">
		{@render children()}
	</main>
	<Footer />
</div>
