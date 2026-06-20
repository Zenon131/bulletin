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

async function check() {
	const { data: topics, error: tErr } = await supabase.from('geotopics').select('name, post_count, weekly_score').order('post_count', { ascending: false });
	if (tErr) { console.error('Topics error:', tErr.message); return; }

	const { count: totalPosts, error: cErr } = await supabase.from('engrams').select('*', { count: 'exact', head: true });
	if (cErr) { console.error('Count error:', cErr.message); return; }

	const { data: recent, error: rErr } = await supabase.from('engrams').select('content, upvotes, downvotes, created_at, geotopic_id(location_name, topic)').order('created_at', { ascending: false }).limit(5);
	if (rErr) { console.error('Recent error:', rErr.message); return; }

	console.log('═══════════════════════════════════════════════════');
	console.log('   DATABASE CHECK');
	console.log('═══════════════════════════════════════════════════');
	console.log('\n📊 Total posts:', totalPosts);
	console.log('\n📋 Geotopics by post count:');
	topics.forEach(g => {
		console.log(`   ${String(g.post_count).padStart(4)} | ${g.name}`);
	});
	console.log('\n📝 5 most recent posts:');
	recent.forEach((p, i) => {
		const topic = p.geotopic_id?.topic || 'unknown';
		console.log(`\n   ${i + 1}. [${topic}] ${p.content.slice(0, 70)}...`);
		console.log(`      👍 ${p.upvotes} | 👎 ${p.downvotes} | ${new Date(p.created_at).toLocaleDateString()}`);
	});
}
check().catch(e => console.error(e.message));
