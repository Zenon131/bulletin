<script lang="ts">
	import { signup, login } from '$lib/services/auth.js';

	let email = $state('');
	let password = $state('');
	let isLogin = $state(true);
	let loading = $state(false);
	let error = $state('');

	async function handleSubmit() {
		loading = true;
		error = '';

		try {
			if (isLogin) {
				await login(email, password);
			} else {
				await signup(email, password);
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'An unexpected error occurred';
		} finally {
			loading = false;
		}
	}
</script>

<div class="auth-container">
	<h2>{isLogin ? 'Sign In' : 'Sign Up'}</h2>

	<form
		onsubmit={(e) => {
			e.preventDefault();
			handleSubmit();
		}}
	>
		<div class="form-field">
			<label for="email">Email</label>
			<input id="email" type="email" bind:value={email} required />
		</div>

		<div class="form-field">
			<label for="password">Password</label>
			<input id="password" type="password" bind:value={password} required />
		</div>

		{#if error}
			<div class="error">{error}</div>
		{/if}

		<button type="submit" disabled={loading}>
			{loading ? 'Loading...' : isLogin ? 'Sign In' : 'Sign Up'}
		</button>
	</form>

	<p>
		{isLogin ? 'Need an account?' : 'Already have an account?'}
		<button
			type="button"
			class="text-inherit underline hover:text-black"
			onclick={() => (isLogin = !isLogin)}
		>
			{isLogin ? 'Sign Up' : 'Sign In'}
		</button>
	</p>
</div>
