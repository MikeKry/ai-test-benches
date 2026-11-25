#!/usr/bin/env node
// Prepares the human check of the blind review (prereg/rubric.md, section 3.3): for every issue the solution
// with the largest disagreement between the two model passes (ties broken at random) and, if that disagreement
// is below 1 point, one random solution instead; plus one more random solution of the issue with the largest
// disagreement overall. Writes results/review/human/<n>-<code>.md (still blind: code only) and scores.csv.
// The model scores are not included; they are compared after the human scores are filled in.
import { randomInt } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const dir = join(root, 'results', 'review');
const out = join(dir, 'human');
const key = JSON.parse(readFileSync(join(dir, 'key.json'), 'utf8'));
const verdict = (issue, pass) =>
  Object.fromEntries(JSON.parse(readFileSync(join(dir, `verdict-${issue}-pass${pass}.json`), 'utf8')).solutions.map((s) => [s.code, s]));
const total = (s) => s.triage + s.completeness + s.design + s.tests + s.documentation +
  (s.left_alone_justified ? 3 : (() => { const v = Object.values(s.scenarios); const a = v.filter((x) => x !== 'n/a').length; return a ? Math.round((6 * v.filter((x) => x === 'pass').length) / a) / 2 : 0; })());
const pick = (xs) => xs[randomInt(xs.length)];

const sample = [];
for (const issue of Object.keys(key)) {
  const [p1, p2] = [verdict(issue, 1), verdict(issue, 2)];
  const codes = Object.values(key[issue]);
  const gap = Object.fromEntries(codes.map((c) => [c, Math.abs(total(p1[c]) - total(p2[c]))]));
  const max = Math.max(...Object.values(gap));
  const chosen = max >= 1 ? pick(codes.filter((c) => gap[c] === max)) : pick(codes);
  sample.push({ issue, code: chosen, reason: max >= 1 ? `largest disagreement (${max})` : 'random' , gap: max });
}
const worst = sample.reduce((a, b) => (b.gap > a.gap ? b : a));
const extra = pick(Object.values(key[worst.issue]).filter((c) => c !== worst.code));
sample.push({ issue: worst.issue, code: extra, reason: 'random' });

mkdirSync(out, { recursive: true });
const packet = (issue) => readFileSync(join(dir, `packet-${issue}-pass1.md`), 'utf8');
for (const { issue, code } of sample) {
  const text = packet(issue);
  const head = text.split('# Solutions')[0];
  const sol = text.split(/\n\n---\n\n(?=## Solution )/).find((s) => s.includes(`## Solution ${code}`));
  writeFileSync(join(out, `${issue}-${code}.md`), `${head}# Solution to score\n\n${sol.trim()}\n`);
}
writeFileSync(
  join(out, 'scores.csv'),
  'issue,code,triage (0-2),correctness (0-3),completeness (0-1),design (0-2),tests (0-1),documentation (0-1),note\n' +
    sample.map((s) => `${s.issue},${s.code},,,,,,,`).join('\n') + '\n',
);
writeFileSync(join(out, 'sample.json'), JSON.stringify(sample, null, 2));
console.log(sample.map((s) => `${s.issue}-${s.code}: ${s.reason}`).join('\n'));
