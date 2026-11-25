#!/usr/bin/env node
// Builds results/review/human/review.html: the blind human-check sample as one phone-friendly page with a
// scoring form (scores are stored in the artifact's db, collection "scores", one document per solution).
// Usage: node acceptance/review/human-page.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const dir = join(root, 'results', 'review', 'human');
const sample = JSON.parse(readFileSync(join(dir, 'sample.json'), 'utf8'));

const between = (text, start, end) => {
  const i = text.indexOf(start);
  if (i < 0) return '';
  const j = end ? text.indexOf(end, i + start.length) : -1;
  return text.slice(i + start.length, j < 0 ? undefined : j).trim();
};

const items = sample.map(({ issue, code }) => {
  const text = readFileSync(join(dir, `${issue}-${code}.md`), 'utf8');
  const solution = between(text, '# Solution to score');
  const diffs = [...solution.matchAll(/```diff\n([\s\S]*?)\n```/g)].map((m) => m[1]);
  const files = diffs.flatMap((patch) => {
    const subject = (patch.match(/^Subject: (.*)$/m) || [, ''])[1].replace(/^\[PATCH[^\]]*\]\s*/, '');
    return patch.split(/^(?=diff --git )/m).slice(1).map((chunk) => ({
      subject,
      path: (chunk.match(/^diff --git a\/(\S+)/) || [, '?'])[1],
      diff: chunk.replace(/^-- \n[\d.]+\s*$/m, '').trimEnd(),
    }));
  });
  return {
    issue,
    code,
    title: (text.match(/^## #\d+:? ?(.*)$/m) || [, ''])[1].trim(),
    issueText: between(text, '## Issue', '## Ground truth'),
    truth: between(text, '## Ground truth', '## Acceptance scenarios'),
    scenarios: between(text, '## Acceptance scenarios', '# Solution to score'),
    automated: between(solution, 'Automated results:', '### BACKLOG.md section'),
    backlog: between(solution, '### BACKLOG.md section', '### Commits for'),
    commits: [...new Set(files.map((f) => f.subject))],
    files,
  };
});

const rubric = readFileSync(join(root, 'prereg', 'rubric.md'), 'utf8');
const notes = between(rubric, '### Notes per issue', '## 2.');
const data = JSON.stringify({ items, notes }).replace(/</g, '\\u003c');
const template = readFileSync(new URL('./human-page.template.html', import.meta.url), 'utf8');
writeFileSync(join(dir, 'review.html'), template.replace('/*DATA*/null', data));
console.log(`review.html: ${items.length} solutions, ${(data.length / 1024).toFixed(0)} KB of data`);
