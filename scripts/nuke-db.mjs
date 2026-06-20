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
				if (
					(val.startsWith('"') && val.endsWith('"')) ||
					(val.startsWith("'") && val.endsWith("'"))
				)
					val = val.slice(1, -1);
				process.env[m[1]] = val;
			}
		}
	} catch {
		/* no .env file */
	}
}
loadEnv();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_KEY);

async function nuke() {
	console.log('💥 Creating nuke SQL function...');

	// Create a SQL function that hard-deletes everything
	const createSql = `
CREATE OR REPLACE FUNCTION public.nuke_all()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$\nBEGIN\n  DELETE FROM votes;\n  DELETE FROM engrams;\n  DELETE FROM geotopics;\nEND;\n$$;
	`;

	// Try executing raw SQL via the REST API (PostgREST supports this via RPC or raw endpoint)
	const url = process.env.VITE_SUPABASE_URL.replace('/rest/v1', '') + '/rest/v1/';

	// First try to create the function via the pgrest sql endpoint if available
	const sqlUrl = url + 'rpc/sql';
	const res = await fetch(sqlUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			apikey: process.env.VITE_SUPABASE_KEY,
			Authorization: `Bearer ${process.env.VITE_SUPABASE_KEY}`
		},
		body: JSON.stringify({ query: createSql })
	});
	console.log(`   Create function status: ${res.status}`);

	if (res.status === 200 || res.status === 204) {
		console.log('   ✓ Function created, calling nuke_all()...');
		const { error } = await supabase.rpc('nuke_all');
		if (error) {
			console.error('   RPC error:', error.message);
		} else {
			console.log('   ✓ Nuke executed');
		}
	} else {
		const text = await res.text();
		console.log('   Response:', text.slice(0, 200));
		console.log('   Falling back to fetch-based batch delete...');

		// Fallback: use raw fetch to delete with bigger batches
		await rawDelete('votes');
		await rawDelete('engrams');
		await rawDelete('geotopics');
	}

	// Verify
	const { count: gCount } = await supabase
		.from('geotopics')
		.select('*', { count: 'exact', head: true });
	const { count: eCount } = await supabase
		.from('engrams')
		.select('*', { count: 'exact', head: true });
	const { count: vCount } = await supabase
		.from('votes')
		.select('*', { count: 'exact', head: true });

	console.log('\n📊 After nuke:');
	console.log(`   Geotopics: ${gCount}`);
	console.log(`   Engrams: ${eCount}`);
	console.log(`   Votes: ${vCount}`);
}

async function rawDelete(table) {
	const base = process.env.VITE_SUPABASE_URL.replace('/rest/v1', '') + '/rest/v1/';
	let batch = 0;
	while (true) {
		// Read IDs
		const readRes = await fetch(`${base}${table}?select=id&limit=1000`, {
			headers: {
				apikey: process.env.VITE_SUPABASE_KEY,
				Authorization: `Bearer ${process.env.VITE_SUPABASE_KEY}`
			}
		});
		const rows = await readRes.json();
		if (!rows || rows.length === 0) break;

		// Delete by ID range
		const ids = rows.map((r) => r.id);
		const min = Math.min(...ids);
		const max = Math.max(...ids);

		const delRes = await fetch(`${base}${table}?id=gte.${min}&id=lte.${max}`, {
			method: 'DELETE',
			headers: {
				apikey: process.env.VITE_SUPABASE_KEY,
				Authorization: `Bearer ${process.env.VITE_SUPABASE_KEY}`
			}
		});
		batch += ids.length;
		process.stdout.write(`   ${table}: ${batch} deleted\r`);
		if (delRes.status >= 400) {
			console.log(`\n   DELETE error ${delRes.status}: ${await delRes.text()}`);
			break;
		}

		// Check remaining
		const countRes = await fetch(`${base}${table}?select=*`, {
			headers: {
				apikey: process.env.VITE_SUPABASE_KEY,
				Authorization: `Bearer ${process.env.VITE_SUPABASE_KEY}`,
				Prefer: 'count=exact'
			}
		});
		const count = countRes.headers.get('content-range')?.match(/\/(\d+)/)?.[1];
		if (parseInt(count || '0') === 0) break;
	}
	console.log(`\n   ✓ ${table} done`);
}

nuke().catch((e) => console.error(e.message));
