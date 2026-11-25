#!/usr/bin/env node
// Compares the blind human scores (results/review/human/human-scores.json) with the two model passes,
// per criterion, and writes results/review/human/comparison.md. Model correctness is computed from its
// scenario verdicts exactly as compute.mjs does.
// Usage: node acceptance/review/human-compare.mjs
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const dir = join(root, 'results', 'review');
const human = JSON.parse(readFileSync(join(dir, 'human', 'human-scores.json'), 'utf8'));
const key = JSON.parse(readFileSync(join(dir, 'key.json'), 'utf8'));
const half = (x) => Math.round(x * 2) / 2;
const C = ['triage', 'correctness', 'completeness', 'design', 'tests', 'documentation'];

function model(issue, code) {
  const passes = readdirSync(dir)
    .filter((f) => new RegExp(`^verdict-${issue}-pass\\d+\\.json$`).test(f))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')).solutions.find((s) => s.code === code));
  return passes.map((v) => {
    const vals = Object.values(v.scenarios ?? {});
    const pass = vals.filter((s) => s === 'pass').length;
    const appl = vals.filter((s) => s === 'pass' || s === 'fail').length;
    const correctness = v.left_alone_justified ? 3 : appl ? half((3 * pass) / appl) : 0;
    return { ...v, correctness };
  });
}

const total = (s) => C.reduce((a, c) => a + s[c], 0);
const rows = [];
const sums = Object.fromEntries(C.map((c) => [c, { h: 0, m: 0 }]));
for (const [id, h] of Object.entries(human)) {
  const [issue, code] = id.split('-');
  const run = Object.entries(key[issue]).find(([, c]) => c === code)[0];
  const ps = model(issue, code);
  const m = Object.fromEntries(C.map((c) => [c, ps.reduce((a, p) => a + p[c], 0) / ps.length]));
  for (const c of C) { sums[c].h += h[c]; sums[c].m += m[c]; }
  const ht = total(h), mt = total(m);
  rows.push({ id, run, h, m, ht, mt, diff: ht - mt, override: Math.abs(ht - mt) > 2 });
}

const n = rows.length;
const lines = [
  '# Human check vs model (rubric section 3.3)',
  '',
  'Blind: the solution codes were scored on the phone page before key.json or the verdicts were looked at.',
  'Model = mean of the two Opus passes. A human total that differs by more than 2 points replaces the model score.',
  '',
  '| Solution | Run | Human /10 | Model /10 | Difference | Replaced |',
  '|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.id} | ${r.run} | ${r.ht.toFixed(1)} | ${r.mt.toFixed(2)} | ${r.diff >= 0 ? '+' : ''}${r.diff.toFixed(2)} | ${r.override ? 'yes' : 'no'} |`),
  '',
  `Mean difference: ${(rows.reduce((a, r) => a + r.diff, 0) / n).toFixed(2)} points per solution.`,
  '',
  '## Per criterion (mean over the sample)',
  '',
  '| Criterion | Max | Human | Model | Difference |',
  '|---|---|---|---|---|',
  ...C.map((c) => `| ${c} | ${{ triage: 2, correctness: 3, design: 2 }[c] ?? 1} | ${(sums[c].h / n).toFixed(2)} | ${(sums[c].m / n).toFixed(2)} | ${((sums[c].h - sums[c].m) / n).toFixed(2)} |`),
  '',
  '## Human notes',
  '',
  ...rows.map((r) => `- ${r.id} (${r.run}): ${human[r.id].note}`),
];
writeFileSync(join(dir, 'human', 'comparison.md'), lines.join('\n') + '\n');
writeFileSync(
  join(dir, 'human', 'overrides.json'),
  JSON.stringify(Object.fromEntries(rows.filter((r) => r.override).map((r) => [r.id, r.ht])), null, 2) + '\n',
);
console.log(lines.join('\n'));
