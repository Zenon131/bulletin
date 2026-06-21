<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { page } from '$app/state';

	interface NavItem {
		href: string;
		label: string;
		active?: boolean;
	}

	interface Props {
		class?: string;
		brand?: string;
		brandHref?: string;
		imgSrc?: string;
		items?: NavItem[];
		children?: import('svelte').Snippet;
	}

	let {
		class: className,
		brand = 'Bulletin',
		brandHref = '/',
		imgSrc = 'bulletin logo.svg',
		items = [],
		children,
		...restProps
	}: Props = $props();

	let isOpen = $state(false);

	function toggleMenu() {
		isOpen = !isOpen;
	}

	function closeMenu() {
		isOpen = false;
	}

	const defaultItems: NavItem[] = [
		{ href: '/', label: 'Home' },
		{ href: '/explore', label: 'Explore' },
		{ href: '/leaderboard', label: 'Leaderboard' }
	];

	const allItems = $derived(
		defaultItems.map((item) => ({
			...item,
			active: page.url.pathname === item.href
		}))
	);
</script>

<nav
	class={cn(
		'fixed top-0 right-0 left-0 z-50 border-b border-white/40 bg-white/60 shadow-none backdrop-blur-2xl',
		className
	)}
	{...restProps}
>
	<div class="mx-auto max-w-6xl px-4 sm:px-6">
		<div class="flex h-14 items-center justify-between">
			<div class="flex items-center gap-6">
				<!-- Brand -->
				<a href={brandHref} class="group flex items-center gap-2.5">
					<img src={imgSrc} alt="Bulletin Logo" class="h-7 w-auto" />
					<span
						class="text-lg font-bold tracking-tight text-[hsl(var(--foreground))] transition-colors group-hover:text-black"
					>
						{brand}
					</span>
				</a>

				<!-- Desktop Nav -->
				<div class="hidden items-center gap-1 sm:flex">
					{#each allItems as item}
						<a
							href={item.href}
							data-sveltekit-preload-data="hover"
							class={cn(
								'relative rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
								item.active
									? 'bg-black text-white shadow-md'
									: 'text-[hsl(var(--muted-foreground))] hover:bg-black/5 hover:text-black'
							)}
						>
							{item.label}
						</a>
					{/each}
					{#each items as item}
						<a
							href={item.href}
							data-sveltekit-preload-data="hover"
							class={cn(
								'relative rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
								item.active
									? 'bg-black text-white shadow-md'
									: 'text-[hsl(var(--muted-foreground))] hover:bg-black/5 hover:text-black'
							)}
						>
							{item.label}
						</a>
					{/each}
				</div>
			</div>

			<!-- Right side + mobile toggle -->
			<div class="flex items-center gap-3">
				<div class="hidden sm:flex sm:items-center">
					{@render children?.()}
				</div>

				<button
					type="button"
					class="inline-flex items-center justify-center rounded-xl p-2 text-[hsl(var(--muted-foreground))] hover:bg-black/5 hover:text-black focus:outline-none sm:hidden"
					aria-expanded={isOpen}
					onclick={toggleMenu}
				>
					<span class="sr-only">Open menu</span>
					{#if isOpen}
						<svg
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="2"
							stroke="currentColor"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					{:else}
						<svg
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="2"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
							/>
						</svg>
					{/if}
				</button>
			</div>
		</div>
	</div>

	<!-- Mobile menu -->
	{#if isOpen}
		<div class="border-t border-white/40 bg-white/80 backdrop-blur-2xl sm:hidden">
			<div class="space-y-1 px-4 py-3">
				{#each allItems as item}
					<a
						href={item.href}
						class={cn(
							'block rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
							item.active
								? 'bg-black text-white'
								: 'text-[hsl(var(--muted-foreground))] hover:bg-black/5 hover:text-black'
						)}
						onclick={closeMenu}
					>
						{item.label}
					</a>
				{/each}
				{#each items as item}
					<a
						href={item.href}
						class={cn(
							'block rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
							item.active
								? 'bg-black text-white'
								: 'text-[hsl(var(--muted-foreground))] hover:bg-black/5 hover:text-black'
						)}
						onclick={closeMenu}
					>
						{item.label}
					</a>
				{/each}
				<div class="border-border mt-2 border-t pt-2">
					{@render children?.()}
				</div>
			</div>
		</div>
	{/if}
</nav>
