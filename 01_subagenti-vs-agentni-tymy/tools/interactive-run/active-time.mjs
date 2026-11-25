// Active time of interactive runs: last transcript entry minus run start (metrics.env start_utc).
// Wall time (duration_s) also contains the driver's quiet wait (--quiet-s) and, for runs that hit the
// time limit, the idle hour; active time is the comparable figure to the -p runs.
// Usage: node active-time.mjs <results-dir>...   -> prints CSV: dir,run,valid,wall_s,active_s,cost_usd
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

console.log('dir,run,valid,end_reason,wall_s,active_s,cost_usd');
for (const root of process.argv.slice(2)) {
  for (const name of readdirSync(root).filter((n) => /^team_\d+$/.test(n)).sort((a, b) => a.split('_')[1] - b.split('_')[1])) {
    const dir = join(root, name);
    if (!existsSync(join(dir, 'interactive.json'))) continue;
    const env = Object.fromEntries(readFileSync(join(dir, 'metrics.env'), 'utf8').trim().split('\n').map((l) => l.split(/=(.*)/s).slice(0, 2)));
    const info = JSON.parse(readFileSync(join(dir, 'interactive.json'), 'utf8'));
    const session = JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8'));
    let last = 0;
    for (const t of info.transcripts ?? []) {
      for (const line of readFileSync(t, 'utf8').split('\n')) {
        try { const ts = Date.parse(JSON.parse(line).timestamp); if (ts > last) last = ts; } catch { /* skip */ }
      }
    }
    const active = last ? Math.round((last - Date.parse(env.start_utc)) / 1000) : '';
    console.log([root, name.split('_')[1], env.validity !== 'invalid', info.end?.reason, env.duration_s, active,
      session.total_cost_usd?.toFixed(3) ?? ''].join(','));
  }
}
