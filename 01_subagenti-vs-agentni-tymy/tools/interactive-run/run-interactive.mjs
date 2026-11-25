#!/usr/bin/env node
// Runs Claude Code in a real terminal (PTY), so agent teams spawn real teammates (in -p mode they don't).
//
// Usage: node run-interactive.mjs --cwd <workspace> --prompt-file <file> --out <dir>
//          [--timeout-s 3600] [--quiet-s 180] [--claude <claude.exe>] -- <claude args...>
//
// What it does, in order:
//  1. starts `claude --session-id <uuid> <args>` in a PTY (120x50) in <workspace>;
//  2. answers only the known first-run screens: theme (default), security notes (continue), workspace trust
//     (selects "Yes, I trust this folder"; the workspace is a fresh benchmark clone), fullscreen renderer
//     ("Not now"). A login screen or an unknown dialog stops the run;
//  3. pastes the prompt into the input box and submits it;
//  4. denies permission prompts (selects "No"), as -p does for tools outside the allowlist, and counts them;
//  5. ends the session when the lead's last message is a finished turn (or a turn interrupted by a denied
//     prompt), no transcript or background task output of the
//     session has changed for --quiet-s seconds and no background task (build, test run) is still running;
//     or at --timeout-s (exit 124, like `timeout`). Until 2026-11-22 03:30 only the transcripts were
//     watched, which cut off runs during long background test runs (see NOTES-driver.md);
//  6. writes <out>/session.json in the shape of `claude -p --output-format json` (usage, modelUsage with
//     costUSD, total_cost_usd, num_turns, result) computed from the transcripts, plus <out>/screen.log and
//     <out>/interactive.json (dialog answers, denials, teammates, transcripts read).
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const pty = require('node-pty');

// List prices per million tokens, fitted exactly (max error 1e-14 USD) to costUSD of 69 earlier -p runs.
const PRICES = {
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheWrite5m: 2.5, cacheWrite1h: 4 },
};

function parseArgs(argv) {
  const sep = argv.indexOf('--');
  const own = sep < 0 ? argv : argv.slice(0, sep);
  const opts = { timeoutS: 3600, quietS: 180, claudeArgs: sep < 0 ? [] : argv.slice(sep + 1) };
  for (let i = 0; i < own.length; i += 2) {
    const key = own[i].replace(/^--/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase());
    opts[key] = own[i + 1];
  }
  for (const k of ['cwd', 'promptFile', 'out']) if (!opts[k]) throw new Error(`missing --${k}`);
  opts.timeoutS = Number(opts.timeoutS);
  opts.quietS = Number(opts.quietS);
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const claudeExe =
  opts.claude ??
  join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Packages',
    'Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe', 'claude.exe');
const prompt = readFileSync(opts.promptFile, 'utf8').trim();
mkdirSync(opts.out, { recursive: true });
const screenLog = join(opts.out, 'screen.log');
writeFileSync(screenLog, '');

const sessionId = randomUUID();
const info = { sessionId, answered: [], denied: [], promptSubmittedAt: null, end: null };
const started = Date.now();

const term = pty.spawn(claudeExe, ['--session-id', sessionId, ...opts.claudeArgs], {
  name: 'xterm-256color',
  cols: 120,
  rows: 50,
  cwd: opts.cwd,
  // Same environment as the earlier -p runs, plus transcript persistence (an inherited child-session
  // marker would otherwise switch transcripts off, and the cost is computed from them).
  env: { ...process.env, CLAUDE_CODE_FORCE_SESSION_PERSISTENCE: '1' },
});

const strip = (s) =>
  s.replace(/\x1b\[[0-9;?<>=]*[ -\/]*[@-~]/g, ' ').replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '').replace(/\x1b[()][0-9A-B]/g, '');
let recent = '';
let lastOutput = Date.now();
let exited = false;
term.onData((d) => {
  const t = strip(d);
  appendFileSync(screenLog, t);
  recent = (recent + t).slice(-6000);
  lastOutput = Date.now();
});
term.onExit(({ exitCode }) => {
  exited = true;
  info.ptyExit = exitCode;
});

// ---- transcripts ----
function sessionFiles() {
  const root = join(homedir(), '.claude', 'projects');
  const files = [];
  for (const dir of existsSync(root) ? readdirSync(root) : []) {
    const lead = join(root, dir, `${sessionId}.jsonl`);
    if (!existsSync(lead)) continue;
    files.push(lead);
    const walk = (d) => {
      if (!existsSync(d)) return;
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.jsonl')) files.push(p);
      }
    };
    walk(join(root, dir, sessionId));
  }
  return files;
}

function readLines(file) {
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

function leadFinished(files) {
  const lead = files[0];
  if (!lead) return false;
  const all = readLines(lead);
  // A task notification queued after the lead's last message is NOT waited for: an idle lead of an
  // interactive team session does not pick it up by itself (observed in V2 #3/#4, 2026-11-22). The
  // enqueue writes the transcript, so the quiet period already gives the lead --quiet-s to react; a
  // notification still undelivered after that is recorded as stuck.
  const lastAssistant = all.map((e) => e.type).lastIndexOf('assistant');
  const ops = all.slice(lastAssistant + 1).filter((e) => e.type === 'queue-operation');
  info.stuckNotifications = ops.filter((e) => e.operation === 'enqueue').length - ops.filter((e) => e.operation !== 'enqueue').length;
  const entries = all.filter((e) => e.type === 'assistant' || e.type === 'user');
  const last = entries.at(-1);
  // A denied permission prompt of the lead's own tool call interrupts its turn; it then waits like a finished turn.
  if (last?.type === 'user' && JSON.stringify(last.message?.content ?? '').includes('[Request interrupted by user')) return true;
  if (!last || last.type !== 'assistant') return false;
  const content = last.message?.content ?? [];
  return last.message?.stop_reason === 'end_turn' || (!content.some((c) => c.type === 'tool_use') && content.some((c) => c.type === 'text'));
}

// ---- background tasks (Bash run_in_background, Monitor) ----
// Their output goes to %TEMP%/claude/<hash>/<session>/tasks/*.output and not to the transcripts, so a long
// build or test run looks like silence. A task still counts as work until its output carries the
// "[exited with code N]" or "[killed]" trailer, except a server that is up and idle (dev server) and a
// task whose output has not changed for STALE_TASK_S (hung; the overall time limit still applies).
const STALE_TASK_S = 1800;
const SERVER_READY = /ready in|Now listening on|Local:\s+http|Application started/i;
function taskFiles() {
  const root = join(process.env.TEMP ?? tmpdir(), 'claude');
  const files = [];
  for (const h of existsSync(root) ? readdirSync(root) : []) {
    const d = join(root, h, sessionId, 'tasks');
    if (existsSync(d)) for (const f of readdirSync(d)) files.push(join(d, f));
  }
  return files;
}
function runningTasks() {
  return taskFiles().filter((f) => {
    const text = readFileSync(f, 'utf8');
    if (/\[(exited with code -?\d+|killed)\]\s*$/.test(text.slice(-200))) return false;
    if (SERVER_READY.test(text)) return false;
    return (Date.now() - statSync(f).mtimeMs) / 1000 < STALE_TASK_S;
  });
}

// ---- screen handling ----
const flat = () => recent.replace(/\s+/g, '');
let promptSent = false;
let deciding = false;

function choose(label, want) {
  const tail = flat().slice(-2000);
  const cur = tail.lastIndexOf('❯');
  if (tail.slice(cur + 1).replace(/^\d+\./, '').startsWith(want)) {
    info.answered.push({ at: Math.round((Date.now() - started) / 1000), screen: label, option: want });
    recent = '';
    term.write('\r');
  } else {
    term.write('\x1b[B');
  }
  lastOutput = Date.now();
}

function finish(reason, code) {
  if (info.end) return;
  info.end = { reason, afterS: Math.round((Date.now() - started) / 1000) };
  clearInterval(tick);
  try { term.kill(); } catch { /* already gone */ }
  setTimeout(() => writeResults(code), 3000);
}

const tick = setInterval(() => {
  if (info.end) return;
  if (exited) return finish('claude exited', 1);
  if ((Date.now() - started) / 1000 > opts.timeoutS) return finish('timeout', 124);
  if (Date.now() - lastOutput < 2000 || deciding) return;
  const tail = flat().slice(-2000);

  if (/Selectloginmethod|Loginmethod|Pastecodehere|Invalidapikey|Pleaserun\/login/i.test(tail)) return finish('login screen', 1);
  if (/Choosethetextstyle/.test(tail)) return choose('theme', tail.slice(tail.lastIndexOf('❯') + 1).replace(/^\d+\./, '').slice(0, 8));
  if (/Securitynotes/.test(tail) && /PressEntertocontinue/.test(tail)) {
    info.answered.push({ at: Math.round((Date.now() - started) / 1000), screen: 'security notes', option: 'Enter' });
    recent = '';
    term.write('\r');
    return;
  }
  if (/Yes,Itrustthisfolder/.test(tail)) return choose('workspace trust', 'Yes,Itrust');
  if (/Trythenewfullscreenrenderer/.test(tail)) return choose('fullscreen renderer', 'Notnow');
  // A permission prompt: deny it, as -p does for a tool outside the allowlist.
  if (/Doyouwantto(proceed|make|create|allow|run)/i.test(tail) && /❯\d*\.?Yes/.test(tail)) {
    const what = recent.replace(/\s+/g, ' ').slice(-400);
    const cur = tail.lastIndexOf('❯');
    if (/^\d*\.?No/.test(tail.slice(cur + 1))) {
      info.denied.push({ at: Math.round((Date.now() - started) / 1000), screen: what });
      recent = '';
      term.write('\r');
    } else {
      term.write('\x1b[B');
    }
    lastOutput = Date.now();
    return;
  }
  // Ready for input: paste the prompt (bracketed paste keeps its newlines) and submit it.
  if (!promptSent && /acceptedits|bypasspermissions|\?forshortcuts|shift\+tab/i.test(tail)) {
    promptSent = true;
    info.promptSubmittedAt = Math.round((Date.now() - started) / 1000);
    term.write('\x1b[200~' + prompt + '\x1b[201~');
    deciding = true;
    setTimeout(() => { term.write('\r'); deciding = false; lastOutput = Date.now(); }, 1500);
    return;
  }
  if (!promptSent) return;

  const files = sessionFiles();
  if (files.length === 0) return;
  const newest = Math.max(...[...files, ...taskFiles()].map((f) => statSync(f).mtimeMs));
  if ((Date.now() - newest) / 1000 < opts.quietS) return;
  const running = runningTasks();
  if (running.length) { info.waitedOnTasks = [...new Set([...(info.waitedOnTasks ?? []), ...running.map((f) => f.split(/[\\/]/).pop())])]; return; }
  if (leadFinished(files)) finish('lead finished, transcripts and background tasks quiet', 0);
}, 1000);

// ---- results ----
function writeResults(code) {
  const files = sessionFiles();
  const perMessage = new Map(); // message id -> { model, usage }  (streamed entries repeat the usage)
  let turns = 0;
  let resultText = '';
  const agents = [];
  for (const f of files) {
    const lines = readLines(f);
    const isLead = f.endsWith(`${sessionId}.jsonl`);
    if (!isLead) agents.push({ file: f.slice(f.indexOf(sessionId)), entries: lines.length, agentId: lines.find((l) => l.agentId)?.agentId ?? null });
    for (const e of lines) {
      if (e.type !== 'assistant' || !e.message?.usage) continue;
      perMessage.set(`${f}|${e.message.id ?? e.uuid}`, { model: e.message.model, usage: e.message.usage });
      if (isLead) {
        const text = (e.message.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
        if (text) resultText = text;
      }
    }
    if (isLead) turns = lines.filter((e) => e.type === 'assistant').length;
  }
  const modelUsage = {};
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let total = 0;
  const unpriced = new Set();
  for (const { model, usage: u } of perMessage.values()) {
    if (!model || model === '<synthetic>') continue;
    const m = (modelUsage[model] ??= { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0,
      cacheCreationEphemeral5mInputTokens: 0, cacheCreationEphemeral1hInputTokens: 0, costUSD: 0 });
    const w5 = u.cache_creation?.ephemeral_5m_input_tokens ?? 0;
    const w1 = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    const wAll = u.cache_creation_input_tokens ?? w5 + w1;
    m.inputTokens += u.input_tokens ?? 0;
    m.outputTokens += u.output_tokens ?? 0;
    m.cacheReadInputTokens += u.cache_read_input_tokens ?? 0;
    m.cacheCreationInputTokens += wAll;
    m.cacheCreationEphemeral5mInputTokens += w5 || (w1 ? 0 : wAll);
    m.cacheCreationEphemeral1hInputTokens += w1;
    usage.input_tokens += u.input_tokens ?? 0;
    usage.output_tokens += u.output_tokens ?? 0;
    usage.cache_read_input_tokens += u.cache_read_input_tokens ?? 0;
    usage.cache_creation_input_tokens += wAll;
  }
  for (const [model, m] of Object.entries(modelUsage)) {
    const p = PRICES[model];
    if (!p) { unpriced.add(model); continue; }
    m.costUSD = (m.inputTokens * p.input + m.outputTokens * p.output + m.cacheReadInputTokens * p.cacheRead +
      m.cacheCreationEphemeral5mInputTokens * p.cacheWrite5m + m.cacheCreationEphemeral1hInputTokens * p.cacheWrite1h) / 1e6;
    total += m.costUSD;
  }
  const session = {
    type: 'result',
    subtype: code === 0 ? 'success' : 'error',
    is_error: code !== 0 && code !== 124,
    interactive: true,
    session_id: sessionId,
    duration_ms: Date.now() - started,
    num_turns: turns,
    result: resultText,
    total_cost_usd: unpriced.size ? null : total,
    usage,
    modelUsage,
  };
  writeFileSync(join(opts.out, 'session.json'), JSON.stringify(session, null, 2));
  info.transcripts = files;
  info.agents = agents;
  info.unpricedModels = [...unpriced];
  writeFileSync(join(opts.out, 'interactive.json'), JSON.stringify(info, null, 2));
  console.log(`interactive run: ${info.end.reason}, ${agents.length} agent transcripts, ${info.denied.length} denied prompts, ` +
    `cost ${unpriced.size ? 'n/a (unpriced: ' + [...unpriced].join(',') + ')' : '$' + total.toFixed(2)}`);
  process.exit(code);
}
