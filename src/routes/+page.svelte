<script lang="ts">
    import { cn } from '$lib/utils.js';
    import { 
        Card, 
        CardHeader, 
        CardFooter, 
        CardTitle, 
        CardDescription, 
        CardContent,
        VoteControls
    } from '$lib/components/index.js';
    import { localStorageService } from '$lib/services/storage.js';
    import { supabaseService } from '$lib/services/supabaseService.js';
    import EngramFormCard from '$lib/components/EngramFormCard.svelte';
	import { onMount } from 'svelte';
    import type { Engram } from '$lib/types/index.js';

    // Import browser check from SvelteKit
    import { browser } from '$app/environment';
    
    // Function to get or create a device ID for anonymous use
    function getDeviceId(): string {
        if (!browser) return 'server';
        
        try {
            let deviceId = localStorage.getItem('bulletin_device_id');
            
            if (!deviceId) {
                deviceId = 'device_' + Math.random().toString(36).substring(2, 15) + 
                        Math.random().toString(36).substring(2, 15);
                localStorage.setItem('bulletin_device_id', deviceId);
            }
            
            return deviceId;
        } catch (error) {
            // Fallback if localStorage is not available
            return 'server_' + Math.random().toString(36).substring(2, 15);
        }
    }

    const navItems: { href: string; label: string; active: boolean; }[] = [
        // { href: '/', label: 'Home', active: true },
        // { href: '/about', label: 'About', active: false }
    ];

    let themeOfTheWeek = $state('Hot (Like Summer) Takes');

    // Sample engram data
    let engrams = $state<Engram[]>([]);

    // Track loading state
    let loading = $state(true);
    let selectedCluster = $state('all');
    
    // Fetch engrams from Supabase
    async function fetchEngrams(cluster = selectedCluster) {
        loading = true;
        try {
            const data = await supabaseService.getEngrams(cluster === 'all' ? undefined : cluster);
            console.log('Fetched engrams from Supabase:', data);
            engrams = data;
        } catch (error) {
            console.error('Error fetching engrams:', error);
            // Fallback to localStorage if Supabase fails
            if (browser && localStorageService.isAvailable()) {
                engrams = localStorageService.getEngrams();
                console.log('Fallback: loaded engrams from localStorage:', engrams);
            }
        } finally {
            loading = false;
        }
    }

    onMount(async () => {
        console.log('Component mounted, browser environment:', browser);
        await fetchEngrams();
    })

    const addNewEngram = async (title: string, content: string, cluster: string = 'general') => {
        console.log('🚀 addNewEngram called with:', title, content, cluster);
        
        // Validate input
        if (!title || !content) {
            console.error('Cannot add engram: missing title or content');
            return null;
        }
        
        try {
            console.log('Adding engram to Supabase:', { title, content, cluster });
            
            // Add the engram to Supabase
            const newEngram = await supabaseService.addEngram({ 
                title, 
                content, 
                cluster 
            });
            
            if (newEngram) {
                console.log('Successfully created new engram:', newEngram);
                
                // Refresh the engrams from the server to ensure we have the latest data
                await fetchEngrams();
                
                return newEngram;
            } else {
                console.error('Failed to add engram to Supabase');
                return null;
            }
        } catch (error) {
            console.error('Error in addNewEngram:', error);
            
            // Fallback to localStorage if Supabase fails
            if (browser && localStorageService.isAvailable()) {
                const newEngram = localStorageService.addEngram({ 
                    title, 
                    content, 
                    device_id: getDeviceId(),
                    cluster 
                });
                
                if (newEngram) {
                    console.log('Fallback: added engram to localStorage:', newEngram);
                    engrams = [...engrams, newEngram];
                    return newEngram;
                }
            }
            
            return null;
        }
    };

    const deleteEngram = async (id: number) => {
        console.log('Deleting engram with ID:', id);
        
        try {
            const success = await supabaseService.deleteEngram(id);
            
            if (success) {
                console.log('Successfully deleted engram from Supabase');
                // Refresh engrams from the server
                await fetchEngrams();
            } else {
                console.error('Failed to delete engram from Supabase');
                // Remove from local state as fallback
                engrams = engrams.filter(engram => engram.id !== id);
            }
        } catch (error) {
            console.error('Error deleting engram:', error);
            
            // Fallback to localStorage
            if (browser && localStorageService.isAvailable()) {
                localStorageService.deleteEngram(id);
                engrams = engrams.filter(engram => engram.id !== id);
                console.log('Fallback: deleted engram from localStorage');
            }
        }
    };

    // debug function to manually check if engrams are being added
    function checkEngrams() {
        console.log('Current engrams:', engrams);
        console.log('Storage engrams:', localStorageService.getEngrams());
    }

    // Handle voting on an engram
    async function handleVote(id: number, direction: 'up' | 'down') {
        console.log(`Voting ${direction} on engram ${id}`);
        
        try {
            const updatedEngram = await supabaseService.voteEngram(id, direction);
            
            if (updatedEngram) {
                console.log('Successfully voted on engram:', updatedEngram);
                
                // Update the engram in the UI
                engrams = engrams.map(engram => 
                    engram.id === id ? updatedEngram : engram
                );
            } else {
                console.error('Failed to vote on engram');
            }
        } catch (error) {
            console.error('Error voting on engram:', error);
            
            // Fallback to localStorage
            if (browser && localStorageService.isAvailable()) {
                try {
                    const updatedEngram = localStorageService.voteEngram(id, direction);
                    
                    if (updatedEngram) {
                        console.log('Fallback: voted on engram in localStorage:', updatedEngram);
                        
                        // Update the engram in the UI
                        engrams = engrams.map(engram => 
                            engram.id === id ? updatedEngram : engram
                        );
                    }
                } catch (localError) {
                    console.error('Error voting on engram in localStorage:', localError);
                }
            }
        }
    }

</script>

<svelte:head>
    <title>Bulletin</title>
    <meta name="description" content="Share your thoughts with the community!" />
    <style>
        /* Hide default dropdown arrows in all browsers */
        select {
            -webkit-appearance: none !important;
            -moz-appearance: none !important;
            appearance: none !important;
            text-indent: 1px !important;
            text-overflow: '' !important;
            background-image: none !important;
        }
        select::-ms-expand {
            display: none !important;
        }
    </style>
</svelte:head>

<main class="container mx-auto px-4 py-8 mt-16">
    <div class="max-w-4xl mx-auto">
        <div class="text-center mb-12">
            <h1 class="text-4xl font-bold tracking-tight text-foreground mb-4">Welcome to Bulletin!</h1>
            <h2 class="text-2xl text-muted-foreground mb-2">Theme of the week: <strong>{themeOfTheWeek}</strong></h2>
            <p class="text-xl text-muted-foreground mb-8">
                Write your thoughts and share them with the community!
            </p>
        </div>

        <!-- Engram Form Card -->
        <EngramFormCard onSubmit={addNewEngram} class="mb-12" />
        
        <!-- Cluster filter and post count -->
        <div class="flex justify-between items-center mb-6">
            <div class="flex items-center space-x-2">
                <label for="cluster-filter" class="text-sm text-muted-foreground">Feed:</label>
                <div class="relative">
                    <select 
                        id="cluster-filter" 
                        bind:value={selectedCluster}
                        onchange={() => fetchEngrams(selectedCluster)}
                        class="appearance-none bg-transparent text-sm pr-8 pl-0 py-1 focus:outline-none focus:ring-0 border-none"
                        style="-webkit-appearance: none !important; -moz-appearance: none !important; appearance: none !important; background-image: none !important;"
                    >
                        <option value="all">All Categories</option>
                        <option value="general">General</option>
                        <option value="upenn">UPenn</option>
                    </select>
                    <div class="absolute inset-y-0 right-0 flex items-center pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-muted-foreground" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
                        </svg>
                    </div>
                </div>
            </div>
            
            <div class="flex items-center">
                {#if loading}
                    <div class="text-xs text-muted-foreground">Loading posts...</div>
                {:else}
                    <p class="text-xs text-muted-foreground">
                        {@html `<strong>Posts: </strong> ${engrams.length} total`}
                    </p>
                {/if}
            </div>
        </div>

        <!-- Card Examples -->
        <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-12">
            {#each engrams as engram (engram.id)}
                <Card>
                    {#snippet children()}
                        <CardHeader>
                            {#snippet children()}
                                <CardTitle>
                                    {#snippet children()}
                                        {engram.title}
                                    {/snippet}
                                </CardTitle>
                                <CardDescription>
                                    
                                </CardDescription>
                            {/snippet}
                        </CardHeader>
                        <CardContent>
                            {#snippet children()}
                                {engram.content}
                            {/snippet}
                        </CardContent>
                        <CardFooter>
                            {#snippet children()}
                                <div class="flex justify-between w-full items-center">
                                    <VoteControls 
                                        upvotes={engram.upvotes} 
                                        downvotes={engram.downvotes}
                                        userVote={engram.userVote}
                                        onVote={(direction) => handleVote(engram.id, direction)}
                                    />
                                    
                                    <div class="flex items-center gap-2">
                                        <p class="text-xs text-muted-foreground">
                                            {new Date(engram.createdAt).toLocaleDateString()}
                                        </p>
                                        <!-- <button 
                                            class="text-xs text-destructive hover:underline"
                                            onclick={() => deleteEngram(engram.id)}
                                        >
                                            Addressed
                                        </button> -->
                                    </div>
                                </div>
                            {/snippet}
                        </CardFooter>
                    {/snippet}
                </Card>
            {/each}
        </div>

    </div>
</main>

