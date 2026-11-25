#!/usr/bin/env node
// Builds the anonymized packets of the blind review (prereg/rubric.md, section 3.2).
// Per issue and pass: one file with the rubric, the issue, its ground truth and acceptance scenarios, and the
// solution of every valid run (its `#<n>` commits plus its BACKLOG.md section) under a random code, shuffled.
// The key (code -> run) goes to review/key.json and is not given to the judge.
// Usage: node acceptance/review/build-packets.mjs <passes>
//        REVIEW_DIR=review2 REVIEW_INCLUDE_INTERACTIVE=1 ... for round 2 (see runs.mjs)
import { randomBytes, randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listRuns, resultDir, reviewDir, root, workspaceDir } from './runs.mjs';

const out = reviewDir;
const passes = Number(process.argv[2] ?? 2);
const ISSUES = ['18455', '14197', '10539', '10285', '9662'];

const runs = listRuns();
const read = (p) => readFileSync(p, 'utf8');

// Splits a markdown file into `## ` sections and returns the one whose heading names the issue.
function section(text, issue) {
  const parts = text.split(/^(?=## )/m);
  return parts.filter((p) => new RegExp(`^## .*#${issue}\\b`).test(p)).join('\n').trim();
}

// Words that could reveal the mode, and commit hashes (which are unique per run).
function anonymize(text) {
  return text
    .replace(/^From [0-9a-f]{40} .*$/gm, '')
    .replace(/^(From|Date): .*$/gm, '')
    .replace(/\b(sub-?agents?|teammates?|team(-\w+| ?lead)?|integrators?|orchestrator|(di|taxonomy|deployment|tenants)-dev)\b/gi, '[role]')
    .replace(/\b[0-9a-f]{7,40}\b/g, '[hash]');
}

function solution(run, issue) {
  const dir = join(resultDir(run), 'commits');
  const patches = readdirSync(dir)
    .filter((f) => new RegExp(`^\\d{4}-${issue}-`).test(f))
    .map((f) => read(join(dir, f)));
  const backlogPath = join(workspaceDir(run), 'BACKLOG.md');
  const backlog = existsSync(backlogPath) ? section(read(backlogPath), issue) : '';
  return anonymize(
    `### BACKLOG.md section\n\n${backlog || '(none)'}\n\n### Commits for #${issue} (${patches.length})\n\n` +
      (patches.length ? patches.map((p) => '```diff\n' + p.trim() + '\n```').join('\n\n') : '(no commit for this issue)'),
  );
}

function automated(run, issue) {
  const xml = join(resultDir(run), 'acceptance.xml');
  const score = JSON.parse(read(join(resultDir(run), 'score.json')));
  const lines = [`- Full test suite: build ${score.build}, ${score.regressions.length} regressions against the base commit.`];
  if (existsSync(xml)) {
    const tests = [...read(xml).matchAll(/<test [^>]*name="([^"]*Acceptance(\d+)Tests\.(S\d)_[^"]*)"[^>]*result="(\w+)"/g)]
      .filter((m) => m[2] === issue)
      .map((m) => `- Acceptance test ${m[3]} (${m[1].split('.').pop()}): ${m[4]}`);
    lines.push(...tests);
  }
  return lines.join('\n');
}

const shuffle = (xs) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

mkdirSync(out, { recursive: true });
const rubric = read(join(root, 'prereg', 'rubric.md')).split('## 2.')[0];
const truth = read(join(root, 'prereg', 'ground-truth.md'));
const scenarios = read(join(root, 'prereg', 'acceptance-scenarios.md'));
const issues = read(join(root, 'prompts', 'issues.md'));
const key = existsSync(join(out, 'key.json')) ? JSON.parse(read(join(out, 'key.json'))) : {};

for (const issue of ISSUES) {
  key[issue] ??= Object.fromEntries(runs.map((r) => [r, randomBytes(2).toString('hex').toUpperCase()]));
  const codes = key[issue];
  for (let pass = 1; pass <= passes; pass++) {
    const body = shuffle(runs)
      .map((run) => `## Solution ${codes[run]}\n\nAutomated results:\n${automated(run, issue)}\n\n${solution(run, issue)}`)
      .join('\n\n---\n\n');
    const packet =
      `# Blind review packet: issue #${issue}\n\n` +
      `## Rubric\n\n${rubric}\n\n## Issue\n\n${section(issues, issue)}\n\n## Ground truth\n\n${section(truth, issue)}\n\n` +
      `## Acceptance scenarios\n\n${section(scenarios, issue)}\n\n# Solutions\n\n${body}\n`;
    writeFileSync(join(out, `packet-${issue}-pass${pass}.md`), packet);
    console.log(`packet-${issue}-pass${pass}.md: ${(packet.length / 1024).toFixed(0)} KB`);
  }
}
writeFileSync(join(out, 'key.json'), JSON.stringify(key, null, 2));
