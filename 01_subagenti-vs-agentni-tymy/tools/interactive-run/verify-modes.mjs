// Checks from the transcripts that every run really ran in its mode.
// Per run: Agent/Task calls of the lead, how many of them name a team (team_name), lead-side
// <teammate-message> entries (only real agent teams deliver these), SendMessage calls in all transcripts,
// and the number of agent transcripts (subagents/ folder). Usage: node verify-modes.mjs <results-dir>...
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const projects = join(homedir(), '.claude', 'projects');
const projectDirs = readdirSync(projects);

function transcripts(sid) {
  for (const p of projectDirs) {
    const lead = join(projects, p, `${sid}.jsonl`);
    if (!existsSync(lead)) continue;
    const subs = [];
    const walk = (d) => { if (!existsSync(d)) return; for (const e of readdirSync(d, { withFileTypes: true })) { const x = join(d, e.name); if (e.isDirectory()) walk(x); else if (e.name.endsWith('.jsonl')) subs.push(x); } };
    walk(join(projects, p, sid));
    return { lead, subs };
  }
  return null;
}

const lines = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } });
const uses = (es) => es.flatMap((e) => (Array.isArray(e.message?.content) ? e.message.content : []).filter((c) => c.type === 'tool_use'));

console.log('run,mode,valid,interactive,transcript,agent_calls,team_named_calls,teammate_msgs_to_lead,sendmessage_calls,agent_transcripts');
for (const root of process.argv.slice(2)) {
  for (const name of readdirSync(root).filter((n) => /^(single|subagents|team)_\d+$/.test(n)).sort()) {
    const dir = join(root, name);
    if (!existsSync(join(dir, 'session.json'))) continue;
    let s; try { s = JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8')); } catch { continue; }
    const env = readFileSync(join(dir, 'metrics.env'), 'utf8');
    const valid = !/^validity=invalid/m.test(env);
    const t = s.session_id ? transcripts(s.session_id) : null;
    if (!t) { console.log([dir, name.split('_')[0], valid, !!s.interactive, 'missing'].join(',')); continue; }
    const lead = lines(t.lead);
    const leadUses = uses(lead);
    const agentCalls = leadUses.filter((u) => u.name === 'Agent' || u.name === 'Task');
    const teamNamed = agentCalls.filter((u) => u.input?.team_name).length;
    const teammateMsgs = lead.filter((e) => JSON.stringify(e.message?.content ?? e.content ?? '').includes('<teammate-message')).length;
    const send = [t.lead, ...t.subs].flatMap((f) => uses(lines(f))).filter((u) => u.name === 'SendMessage').length;
    console.log([dir, name.split('_')[0], valid, !!s.interactive, 'ok', agentCalls.length, teamNamed, teammateMsgs, send, t.subs.length].join(','));
  }
}
