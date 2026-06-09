import { browser } from '$app/environment';

const SESSION_LOCATION_KEY = 'bulletin_session_location';
const RECENT_POST_LOCATION_KEY = 'bulletin_recent_post_location';

export const locationService = {
	/**
	 * Resolve user location in priority order:
	 * 1. Cached session location
	 * 2. GPS → reverse geocode
	 * 3. IP geolocation
	 * 4. User's most recent post location
	 * Returns null if all fail (last resort is manual entry)
	 */
	async resolveLocation(): Promise<{ name: string; source: string } | null> {
		if (!browser) return null;

		// 1. Check cached session location
		const cached = this.getSessionLocation();
		if (cached) return { name: cached, source: 'session' };

		// 2. Try GPS → reverse geocode
		try {
			const gpsLocation = await this.getGPSLocation();
			if (gpsLocation) {
				this.setSessionLocation(gpsLocation);
				return { name: gpsLocation, source: 'gps' };
			}
		} catch {
			// GPS denied or unavailable
		}

		// 3. Try IP geolocation
		try {
			const ipLocation = await this.getIPLocation();
			if (ipLocation) {
				this.setSessionLocation(ipLocation);
				return { name: ipLocation, source: 'ip' };
			}
		} catch {
			// IP geolocation failed
		}

		// 4. Fall back to most recent post location
		const recent = this.getRecentPostLocation();
		if (recent) return { name: recent, source: 'history' };

		return null;
	},

	async getGPSLocation(): Promise<string | null> {
		if (!browser || !navigator.geolocation) return null;

		return new Promise((resolve, reject) => {
			navigator.geolocation.getCurrentPosition(
				async (position) => {
					try {
						const city = await this.reverseGeocode(
							position.coords.latitude,
							position.coords.longitude
						);
						resolve(city);
					} catch {
						resolve(null);
					}
				},
				() => reject(null),
				{ timeout: 8000, maximumAge: 600000 }
			);
		});
	},

	async reverseGeocode(lat: number, lng: number): Promise<string | null> {
		try {
			// Use OpenStreetMap Nominatim (free, no API key required for low volume)
			const response = await fetch(
				`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`,
				{ headers: { 'User-Agent': 'Bulletin/1.0' } }
			);
			const data = await response.json();
			const city =
				data.address?.city ||
				data.address?.town ||
				data.address?.village ||
				data.address?.county;
			return city || null;
		} catch {
			return null;
		}
	},

	async getIPLocation(): Promise<string | null> {
		try {
			const response = await fetch('https://ipapi.co/json/');
			const data = await response.json();
			return data.city || null;
		} catch {
			return null;
		}
	},

	getSessionLocation(): string | null {
		if (!browser) return null;
		try {
			return localStorage.getItem(SESSION_LOCATION_KEY);
		} catch {
			return null;
		}
	},

	setSessionLocation(location: string) {
		if (!browser) return;
		try {
			localStorage.setItem(SESSION_LOCATION_KEY, location);
		} catch {
			// storage full
		}
	},

	getRecentPostLocation(): string | null {
		if (!browser) return null;
		try {
			return localStorage.getItem(RECENT_POST_LOCATION_KEY);
		} catch {
			return null;
		}
	},

	setRecentPostLocation(location: string) {
		if (!browser) return;
		try {
			localStorage.setItem(RECENT_POST_LOCATION_KEY, location);
		} catch {
			// storage full
		}
	},

	clearSessionLocation() {
		if (!browser) return;
		try {
			localStorage.removeItem(SESSION_LOCATION_KEY);
		} catch {
			// ignore
		}
	}
};
