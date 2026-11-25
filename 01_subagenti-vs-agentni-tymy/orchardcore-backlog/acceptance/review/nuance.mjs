#!/usr/bin/env node
// Aggregates results/review/nuance/nuance-scores.json (second look at all 45 solutions: did the solution
// understand what exactly the issue asks) into results/review/nuance/nuance.md, next to the model score.
// Usage: node acceptance/review/nuance.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const results = join(root, 'results');
const key = JSON.parse(readFileSync(join(results, 'review', 'key.json'), 'utf8'));
const nuance = JSON.parse(readFileSync(join(results, 'review', 'nuance', 'nuance-scores.json'), 'utf8'));
const model = Object.fromEntries(
  readFileSync(join(results, 'quality.csv'), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(',')),
  ).valueOf();
const header = readFileSync(join(results, 'quality.csv'), 'utf8').trim().split(/\r?\n/)[0].split(',');
const ISSUES = ['18455', '14197', '10539', '10285', '9662'];
const MODES = ['single', 'subagents', 'team'];
const runs = Object.keys(key[ISSUES[0]]);

const modelOf = (run, issue) => {
  const row = readFileSync(join(results, 'quality.csv'), 'utf8').trim().split(/\r?\n/).find((l) => l.startsWith(run + ','));
  return Number(row.split(',')[header.indexOf(issue)]);
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => Math.sqrt(xs.reduce((s, x) => s + (x - mean(xs)) ** 2, 0) / (xs.length - 1));

const rows = runs.map((run) => {
  const r = { run, mode: run.split('_')[0] };
  for (const i of ISSUES) r[i] = nuance[i][key[i][run]][0];
  r.total = ISSUES.reduce((s, i) => s + r[i], 0);
  r.model = ISSUES.reduce((s, i) => s + modelOf(run, i), 0);
  return r;
});

const lines = [
  '# Second look: did the solution understand the exact ask?',
  '',
  'All 45 solutions re-read with the lens of the human check (what exactly the issue wanted, what already existed in the',
  'repository). Scores 0-10 per solution on the human scale; the six human-checked solutions keep the human score.',
  'Not blind: the run key was open during this pass. No new runs. "Model" is results/quality.md (with the human overrides).',
  '',
  `| Mode | Second look /50 | ${ISSUES.map((i) => `#${i}`).join(' | ')} | Model /50 |`,
  `|---|---|${ISSUES.map(() => '---').join('|')}|---|`,
];
for (const m of MODES) {
  const g = rows.filter((r) => r.mode === m);
  lines.push(
    `| ${m} | ${mean(g.map((r) => r.total)).toFixed(1)} ± ${sd(g.map((r) => r.total)).toFixed(1)} | ` +
      `${ISSUES.map((i) => mean(g.map((r) => r[i])).toFixed(1)).join(' | ')} | ${mean(g.map((r) => r.model)).toFixed(1)} |`,
  );
}
lines.push('', '## Per run', '', `| Run | Second look | ${ISSUES.map((i) => `#${i}`).join(' | ')} | Model |`, `|---|---|${ISSUES.map(() => '---').join('|')}|---|`);
for (const r of rows) lines.push(`| ${r.run} | ${r.total.toFixed(1)} | ${ISSUES.map((i) => r[i].toFixed(1)).join(' | ')} | ${r.model.toFixed(1)} |`);
lines.push('', '## Per solution', '');
for (const i of ISSUES) {
  lines.push(`### #${i}`, '', '| Solution | Run | Second look | Model | Why |', '|---|---|---|---|---|');
  const runOf = Object.fromEntries(Object.entries(key[i]).map(([run, c]) => [c, run]));
  for (const [code, [score, why]] of Object.entries(nuance[i]).sort((a, b) => b[1][0] - a[1][0]))
    lines.push(`| ${code} | ${runOf[code]} | ${score.toFixed(1)} | ${modelOf(runOf[code], i).toFixed(2)} | ${why} |`);
  lines.push('');
}
writeFileSync(join(results, 'review', 'nuance', 'nuance.md'), lines.join('\n'));
console.log(lines.slice(0, 30).join('\n'));
