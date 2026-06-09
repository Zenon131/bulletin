import { browser } from '$app/environment';

let cachedCity: string | null = null;
let cachedAt = 0;
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

export const geolocationService = {
	async getCity(): Promise<string | null> {
		if (!browser) return null;

		// Return cached city if fresh
		if (cachedCity && Date.now() - cachedAt < CACHE_TTL) {
			return cachedCity;
		}

		if (!navigator.geolocation) {
			console.warn('Geolocation not available');
			return null;
		}

		try {
			const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
				navigator.geolocation.getCurrentPosition(resolve, reject, {
					timeout: 8000,
					enableHighAccuracy: false
				});
			});

			const { latitude, longitude } = pos.coords;

			// Free reverse-geocode API — no key required
			const res = await fetch(
				`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
				{ signal: AbortSignal.timeout(6000) }
			);

			if (!res.ok) throw new Error(`Reverse geocode failed: ${res.status}`);

			const data = await res.json();
			const city = data.city || data.locality || data.principalSubdivision || null;

			if (city) {
				cachedCity = city;
				cachedAt = Date.now();
				return city;
			}
		} catch (err) {
			console.error('Geolocation/reverse-geocode error:', err);
		}

		return null;
	},

	clearCache() {
		cachedCity = null;
		cachedAt = 0;
	}
};
