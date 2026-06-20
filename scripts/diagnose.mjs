import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
	try {
		const envPath = resolve(process.cwd(), '.env');
		const raw = readFileSync(envPath, 'utf-8');
		for (const line of raw.split('\n')) {
			const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
			if (m && !process.env[m[1]]) {
				let val = m[2].trim();
				if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
				process.env[m[1]] = val;
			}
		}
	} catch { /* no .env file */ }
}
loadEnv();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_KEY);

async function diagnose() {
	// Count posts with null geotopic_id
	const { data: nullGeo, error: nErr } = await supabase
		.from('engrams')
		.select('*', { count: 'exact', head: true })
		.is('geotopic_id', null);
	console.log('Posts with null geotopic_id:', nullGeo);

	// Count posts with geotopic_id not in philly
	const { data: phillyIds } = await supabase.from('geotopics').select('id').eq('location_name', 'Philadelphia');
	const ids = phillyIds?.map((g) => g.id) || [];
	console.log('Philly geotopic IDs:', ids.slice(0, 5), '... total:', ids.length);

	// Count posts linked to philly geotopics
	const { count: phillyPosts } = await supabase
		.from('engrams')
		.select('*', { count: 'exact', head: true })
		.in('geotopic_id', ids);
	console.log('Posts linked to philly geotopics:', phillyPosts);

	// Count posts linked to non-philly geotopics
	const { count: nonPhillyPosts } = await supabase
		.from('engrams')
		.select('*', { count: 'exact', head: true })
		.not('geotopic_id', 'in', `(${ids.join(',')})`);
	console.log('Posts linked to non-philly geotopics:', nonPhillyPosts);

	// Sample post
	const { data: sample } = await supabase.from('engrams').select('geotopic_id, content').limit(3);
	console.log('\nSample posts:');
	sample?.forEach((p) => console.log(`  geo_id=${p.geotopic_id} | ${p.content.slice(0, 50)}...`));
}

diagnose().catch((e) => console.error(e.message));
