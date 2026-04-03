<script lang="ts">
	import { cn } from '$lib/utils.js';

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
		items = [],
		imgSrc = 'bulletin logo.svg',
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
</script>

<nav class={cn('fixed top-0 left-0 right-0 z-50 border-b bg-[hsl(var(--background))]/95 backdrop-blur supports-[backdrop-filter]:bg-[hsl(var(--background))]/60 shadow-sm', className)} {...restProps}>
	<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="flex h-16 justify-between">
			<div class="flex">
				
				<!-- Brand/Logo -->
				<div class="flex flex-shrink-0 items-center gap-2">
					<a href={brandHref} class="flex items-center gap-3 group">
						<img src={imgSrc} alt="Bulletin Logo" class="h-8 w-auto" />
						<h1 class="text-xl font-bold text-[hsl(var(--foreground))] group-hover:text-primary transition-colors">
							{brand}
						</h1>
					</a>
				</div>

				<!-- Desktop Navigation -->
				<div class="hidden sm:ml-6 sm:flex sm:space-x-8">
					{#each items as item}
						<a 
							href={item.href}
							class={cn(
								'inline-flex items-center px-1 pt-1 text-sm font-medium transition-colors hover:text-[hsl(var(--foreground))]/80',
								item.active 
									? 'border-b-2 border-primary text-[hsl(var(--foreground))]' 
									: 'text-[hsl(var(--foreground))]/60'
							)}
						>
							{item.label}
						</a>
					{/each}
				</div>
			</div>

			<!-- Desktop Right Side -->
			<div class="hidden sm:ml-6 sm:flex sm:items-center">
				{@render children?.()}
			</div>

			<!-- Mobile menu button -->
			<div class="flex items-center sm:hidden">
				<button
					type="button"
					class="inline-flex items-center justify-center rounded-md p-2 text-[hsl(var(--foreground))]/60 hover:bg-accent hover:text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
					aria-controls="mobile-menu"
					aria-expanded={isOpen}
					onclick={toggleMenu}
				>
					<span class="sr-only">Open main menu</span>
					{#if isOpen}
						<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					{:else}
						<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
						</svg>
					{/if}
				</button>
			</div>
		</div>
	</div>

	<!-- Mobile menu -->
	{#if isOpen}
		<div class="sm:hidden" id="mobile-menu">
			<div class="space-y-1 pb-3 pt-2">
				{#each items as item}
					<a
						href={item.href}
						class={cn(
							'block border-l-4 py-2 pl-3 pr-4 text-base font-medium transition-colors',
							item.active
								? 'border-primary bg-primary/10 text-primary'
								: 'border-transparent text-[hsl(var(--foreground))]/60 hover:border-accent hover:bg-accent hover:text-[hsl(var(--foreground))]'
						)}
						onclick={closeMenu}
					>
						{item.label}
					</a>
				{/each}
				
				<!-- Mobile Right Side -->
				<div class="mt-4 border-t border-border pt-4">
					{@render children?.()}
				</div>
			</div>
		</div>
	{/if}
</nav>
