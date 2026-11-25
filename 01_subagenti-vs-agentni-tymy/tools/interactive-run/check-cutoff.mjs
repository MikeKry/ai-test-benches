// Did the driver end an interactive run while work was still going on?
// Looks at the session's background task outputs (%TEMP%/claude/<hash>/<session>/tasks/*.output):
// a task without the "[exited with code" trailer was still running when the session was killed, and
// a task that finished less than --quiet-s before the end had its notification still in flight.
// Also flags task notifications queued in the lead transcript after its last assistant message.
// Usage: node check-cutoff.mjs <results-dir>...
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const claudeTmp = join(process.env.TEMP ?? tmpdir(), 'claude');
const hashes = existsSync(claudeTmp) ? readdirSync(claudeTmp) : [];

for (const root of process.argv.slice(2)) {
  for (const name of readdirSync(root).filter((n) => /^team_\d+$/.test(n))) {
    const dir = join(root, name);
    if (!existsSync(join(dir, 'session.json'))) continue;
    const sid = JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8')).session_id;
    const env = Object.fromEntries(readFileSync(join(dir, 'metrics.env'), 'utf8').trim().split('\n').map((l) => l.split(/=(.*)/s).slice(0, 2)));
    const end = Date.parse(env.end_utc);
    const running = [];
    const late = [];
    for (const h of hashes) {
      const tdir = join(claudeTmp, h, sid, 'tasks');
      if (!existsSync(tdir)) continue;
      for (const f of readdirSync(tdir)) {
        const p = join(tdir, f);
        const text = readFileSync(p, 'utf8');
        const mtime = statSync(p).mtimeMs;
        if (!/\[exited with code/.test(text.slice(-300))) running.push(f);
        else if (end - mtime < 200_000) late.push(`${f}@-${Math.round((end - mtime) / 1000)}s`);
      }
    }
    const lead = JSON.parse(readFileSync(join(dir, 'interactive.json'), 'utf8')).transcripts?.[0];
    let queuedAfterLast = 0;
    if (lead) {
      const entries = readFileSync(lead, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } });
      const lastAssistant = entries.map((e) => e.type).lastIndexOf('assistant');
      queuedAfterLast = entries.slice(lastAssistant + 1).filter((e) => e.type === 'queue-operation').length;
    }
    const flag = running.length || queuedAfterLast ? 'CUT' : late.length ? 'late' : 'ok';
    console.log(`${dir} ${flag} running=[${running}] finished_near_end=[${late}] queued_after_last=${queuedAfterLast}`);
  }
}
