import { browser } from '$app/environment';

interface OpenRouterResponse {
	id: string;
	choices: {
		message: {
			role: string;
			content: string;
		};
		finish_reason: string;
	}[];
	error?: {
		message: string;
	};
}

interface ExtractedGeotopic {
	location_name: string;
	topic: string;
	confidence: number;
}

const API_KEY = browser ? import.meta.env.VITE_OPENROUTER_API_KEY : '';
const MODEL = 'meta-llama/llama-3.1-8b-instruct'; // ~$0.02/1M input tokens, extremely cheap

const SYSTEM_PROMPT = `You are a location and topic extractor for a social network called Bulletin.
Given a post title and content, extract:
1. The location (city/area) mentioned or implied
2. The main topic/category of the post

Respond ONLY with a JSON object in this exact format:
{"location_name": "City Name", "topic": "Topic Name", "confidence": 0.95}

Rules:
- If no location is found, set location_name to ""
- If no topic is found, set topic to ""
- Confidence should be 0.0-1.0
- Keep topic short: 1-3 words, capitalized
- Use full city names (e.g. "New York City" not "NYC")
- Examples of good topics: "Music Shows", "Startups", "Food", "Hiking", "Tech", "Apartments", "Events"`;

export const openRouterService = {
	async extractGeotopic(title: string, content: string): Promise<ExtractedGeotopic | null> {
		if (!API_KEY) {
			console.warn('OpenRouter API key not configured (VITE_OPENROUTER_API_KEY)');
			return null;
		}

		const userPrompt = `Title: ${title}\nContent: ${content}`;

		try {
			const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${API_KEY}`,
					'HTTP-Referer':
						typeof window !== 'undefined' ? window.location.origin : 'https://bulletin.app',
					'X-Title': 'Bulletin'
				},
				body: JSON.stringify({
					model: MODEL,
					messages: [
						{ role: 'system', content: SYSTEM_PROMPT },
						{ role: 'user', content: userPrompt }
					],
					max_tokens: 128,
					temperature: 0.1,
					response_format: { type: 'json_object' }
				})
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('OpenRouter API error:', response.status, errorText);
				return null;
			}

			const data: OpenRouterResponse = await response.json();

			if (data.error) {
				console.error('OpenRouter error:', data.error.message);
				return null;
			}

			const rawContent = data.choices[0]?.message?.content?.trim();
			if (!rawContent) {
				console.error('OpenRouter returned empty content');
				return null;
			}

			// Parse the JSON response
			let parsed: ExtractedGeotopic;
			try {
				parsed = JSON.parse(rawContent);
			} catch {
				// Sometimes the model wraps it in markdown code blocks
				const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
				if (!jsonMatch) {
					console.error('Could not parse OpenRouter response:', rawContent);
					return null;
				}
				parsed = JSON.parse(jsonMatch[0]);
			}

			if (!parsed.location_name || !parsed.topic) {
				return null;
			}

			return {
				location_name: parsed.location_name,
				topic: parsed.topic,
				confidence: Math.min(1, Math.max(0, parsed.confidence || 0.85))
			};
		} catch (error) {
			console.error('Error calling OpenRouter:', error);
			return null;
		}
	}
};
