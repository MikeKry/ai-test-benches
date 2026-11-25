#!/usr/bin/env node
// Computes the quality score (prereg/rubric.md) from the blind-review verdicts and writes
// results/quality.md and results/quality.csv. Correctness = 3 x passing / applicable scenarios, rounded to
// halves (full points for a justified skip, 0 with a regression). Two passes are averaged; when they differ
// by more than 2 points on a solution, the median of three passes is used (a third pass must exist).
// Usage: node acceptance/review/compute.mjs
//        REVIEW_DIR=review2 REVIEW_INCLUDE_INTERACTIVE=1 ... for round 2: writes results/quality-review2.{md,csv}
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listRuns, modesOf, resultDir, reviewDir, root } from './runs.mjs';

const results = join(root, 'results');
const dir = reviewDir;
const round2 = dir !== join(results, 'review');
const ISSUES = ['18455', '14197', '10539', '10285', '9662'];
const key = JSON.parse(readFileSync(join(dir, 'key.json'), 'utf8'));
const MODES = modesOf(Object.keys(key[ISSUES[0]]));
const half = (x) => Math.round(x * 2) / 2;
// Human check (rubric 3.3): issue-code -> human total, where it differed from the model by more than 2 points.
// Round 1 reads overrides.json. Round 2 re-applies the same rule to the human scores of round 1: the solution is
// found through the round-1 key, and the human total replaces the round-2 model score if they differ by > 2.
const overridesFile = join(results, 'review', 'human', 'overrides.json');
const overrides = !round2 && existsSync(overridesFile) ? JSON.parse(readFileSync(overridesFile, 'utf8')) : {};
const humanByRun = {}; // `${issue}|${run}` -> human total
if (round2) {
  const key1 = JSON.parse(readFileSync(join(results, 'review', 'key.json'), 'utf8'));
  const human = JSON.parse(readFileSync(join(results, 'review', 'human', 'human-scores.json'), 'utf8'));
  for (const [id, h] of Object.entries(human)) {
    const [issue, code] = id.split('-');
    const run = Object.entries(key1[issue]).find(([, c]) => c === code)?.[0];
    if (run) humanByRun[`${issue}|${run}`] = h.triage + h.correctness + h.completeness + h.design + h.tests + h.documentation;
  }
}

// Hours of work: wall time for -p runs; for real-team runs the active time (last transcript entry minus start),
// since their wall time also holds the driver's quiet wait (tools/interactive-run/NOTES-driver.md).
function hoursOf(run, metrics) {
  if (!run.startsWith('teamreal_')) return Number(metrics.duration_s) / 3600;
  const info = JSON.parse(readFileSync(join(resultDir(run), 'interactive.json'), 'utf8'));
  let last = 0;
  for (const t of info.transcripts ?? []) {
    for (const line of readFileSync(t, 'utf8').split('\n')) {
      try { const ts = Date.parse(JSON.parse(line).timestamp); if (ts > last) last = ts; } catch { /* skip */ }
    }
  }
  return (last - Date.parse(metrics.start_utc)) / 3600000;
}

function issueScore(v, regressions) {
  const values = Object.values(v.scenarios ?? {});
  const pass = values.filter((s) => s === 'pass').length;
  const applicable = values.filter((s) => s === 'pass' || s === 'fail').length;
  let correctness = v.left_alone_justified ? 3 : applicable ? half((3 * pass) / applicable) : 0;
  if (regressions > 0) correctness = 0;
  return { total: v.triage + correctness + v.completeness + v.design + v.tests + v.documentation, correctness };
}

const verdicts = {}; // issue -> pass -> code -> verdict
for (const f of readdirSync(dir).filter((f) => /^verdict-\d+-pass\d+\.json$/.test(f))) {
  const [, issue, pass] = f.match(/verdict-(\d+)-pass(\d+)/);
  const v = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  ((verdicts[issue] ??= {})[pass] = Object.fromEntries(v.solutions.map((s) => [s.code, s])));
}

const runs = Object.keys(key[ISSUES[0]]);
const rows = [];
const needThird = [];
const appliedHuman = [];
const keptModel = [];
for (const run of runs) {
  const score = JSON.parse(readFileSync(join(resultDir(run), 'score.json'), 'utf8'));
  const metrics = Object.fromEntries(
    readFileSync(join(resultDir(run), 'metrics.env'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => l.split(/=(.*)/s)),
  );
  const session = JSON.parse(readFileSync(join(resultDir(run), 'session.json'), 'utf8'));
  const row = { run, mode: run.split('_')[0], hours: hoursOf(run, metrics), cost: session.total_cost_usd };
  for (const issue of ISSUES) {
    const code = key[issue][run];
    const passes = Object.values(verdicts[issue] ?? {}).map((p) => p[code]).filter(Boolean);
    const scores = passes.map((v) => issueScore(v, score.regressions.length).total);
    if (scores.length >= 2 && Math.abs(scores[0] - scores[1]) > 2 && scores.length < 3) needThird.push(`${issue}/${code}`);
    const sorted = [...scores].sort((a, b) => a - b);
    row[issue] = scores.length >= 3 ? sorted[1] : scores.length ? scores.reduce((a, b) => a + b) / scores.length : NaN;
    row[`${issue}_passes`] = scores.join('/');
    if (`${issue}-${code}` in overrides) {
      row[issue] = overrides[`${issue}-${code}`];
      row[`${issue}_passes`] += ', human';
    }
    const h = humanByRun[`${issue}|${run}`];
    if (h !== undefined && Math.abs(h - row[issue]) > 2) {
      appliedHuman.push(`${issue}/${run}: model ${row[issue].toFixed(2)} → human ${h}`);
      row[issue] = h;
      row[`${issue}_passes`] += ', human';
    } else if (h !== undefined) keptModel.push(`${issue}/${run}: model ${row[issue].toFixed(2)}, human ${h}`);
  }
  row.quality = ISSUES.reduce((s, i) => s + row[i], 0);
  rows.push(row);
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => (xs.length < 2 ? 0 : Math.sqrt(xs.reduce((s, x) => s + (x - mean(xs)) ** 2, 0) / (xs.length - 1)));
const fmt = (xs, d = 1) => `${mean(xs).toFixed(d)} ± ${sd(xs).toFixed(d)}`;

const lines = [
  round2 ? '# Quality score, review round 2 (all 12 runs incl. real agent teams)' : '# Quality score (V3 pilot)',
  '',
  'Blind review (claude-opus-5-5, two independent passes, shuffled anonymized solutions) plus the automated acceptance tests,',
  'scored with prereg/rubric.md. 0 to 10 per issue, 0 to 50 per run. Mean ± sample standard deviation over 3 runs.',
  ...(round2 ? ['"team" = named agents under -p (in effect subagents); "teamreal" = real agent teams, interactive (amendment A2).',
    'Quality per hour of teamreal uses active time (without the driver\'s quiet wait).'] : []),
  '',
  `| Mode | Quality /50 | ${ISSUES.map((i) => `#${i}`).join(' | ')} | Quality per hour | Quality per $ |`,
  `|---|---|${ISSUES.map(() => '---').join('|')}|---|---|`,
];
for (const mode of MODES) {
  const g = rows.filter((r) => r.mode === mode);
  lines.push(
    `| ${mode} | ${fmt(g.map((r) => r.quality))} | ${ISSUES.map((i) => fmt(g.map((r) => r[i]))).join(' | ')} | ` +
      `${fmt(g.map((r) => r.quality / r.hours))} | ${fmt(g.map((r) => r.quality / r.cost))} |`,
  );
}

lines.push('', '## Notable differences (rubric section 4)', '');
for (let a = 0; a < MODES.length; a++) {
  for (let b = a + 1; b < MODES.length; b++) {
    const A = rows.filter((r) => r.mode === MODES[a]);
    const B = rows.filter((r) => r.mode === MODES[b]);
    const diff = mean(A.map((r) => r.quality)) - mean(B.map((r) => r.quality));
    const bar = Math.max(sd(A.map((r) => r.quality)), sd(B.map((r) => r.quality)));
    const sameWay = ISSUES.filter((i) => Math.sign(mean(A.map((r) => r[i])) - mean(B.map((r) => r[i]))) === Math.sign(diff)).length;
    const notable = Math.abs(diff) > bar && sameWay >= 3;
    lines.push(
      `- ${MODES[a]} vs ${MODES[b]}: difference ${diff.toFixed(1)}, larger SD ${bar.toFixed(1)}, same direction in ${sameWay}/5 issues: ` +
        (notable ? '**notable**' : 'no clear difference'),
    );
  }
}

lines.push('', '## Per run', '', `| Run | Quality | ${ISSUES.map((i) => `#${i} (passes)`).join(' | ')} |`, `|---|---|${ISSUES.map(() => '---').join('|')}|`);
for (const r of rows) lines.push(`| ${r.run} | ${r.quality.toFixed(1)} | ${ISSUES.map((i) => `${r[i].toFixed(1)} (${r[`${i}_passes`]})`).join(' | ')} |`);
if (Object.keys(overrides).length)
  lines.push('', `Replaced by the human check (differed by more than 2 points): ${Object.entries(overrides).map(([k, v]) => `${k} → ${v}`).join(', ')}. See review/human/comparison.md.`);
if (appliedHuman.length) lines.push('', `Replaced by the human check of round 1 (differed by more than 2 points): ${appliedHuman.join('; ')}.`);
if (keptModel.length) lines.push('', `Human score within 2 points, model score kept: ${keptModel.join('; ')}.`);
if (needThird.length)lines.push('', `Third pass needed (passes differ by more than 2): ${needThird.join(', ')}`);

const suffix = round2 ? `-${process.env.REVIEW_DIR}` : '';
writeFileSync(join(results, `quality${suffix}.md`), lines.join('\n') + '\n');
writeFileSync(
  join(results, `quality${suffix}.csv`),
  ['run,mode,quality,' + ISSUES.join(','), ...rows.map((r) => [r.run, r.mode, r.quality, ...ISSUES.map((i) => r[i])].join(','))].join('\n') + '\n',
);
console.log(lines.join('\n'));
