<script lang="ts">
    import { termsOfService } from '$lib/legal/policies.ts';
    import { marked } from 'marked';
</script>

<div class="container mx-auto px-4 py-8">
    <div class="prose prose-base max-w-none bg-white text-black">
        {@html marked.parse(termsOfService)}
    </div>
</div>

<style>
    /* Ensure bullet points are black within the prose content */
    .prose ul li::marker {
        color: #000; /* Black color */
    }
</style>