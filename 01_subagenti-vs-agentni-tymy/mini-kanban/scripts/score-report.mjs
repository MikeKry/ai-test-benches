#!/usr/bin/env node
// Combines the raw test outputs of one run into score.json and prints a one-line summary.
// Usage: node scripts/score-report.mjs <output-dir>
//
// Reads  unit.json (Vitest), ui.json (Playwright), arch.txt (hidden-tests/arch.sh).
// A missing or unreadable result counts as 0 passed tests (see the *.log files for the reason).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_SCORE, MAX_TOTAL, fail, readJson } from './lib/common.mjs';

const dir = process.argv[2];
if (!dir) fail('usage: node scripts/score-report.mjs <output-dir>', 2);

const archFile = join(dir, 'arch.txt');
const archMatch = existsSync(archFile)
  ? readFileSync(archFile, 'utf8').match(/arch_passed=(\d+)\//)
  : null;

const score = {
  unit: readJson(join(dir, 'unit.json'))?.numPassedTests ?? 0,
  ui: readJson(join(dir, 'ui.json'))?.stats?.expected ?? 0,
  arch: archMatch ? Number(archMatch[1]) : 0,
};
score.total = score.unit + score.ui + score.arch;

writeFileSync(join(dir, 'score.json'), JSON.stringify({ ...score, max: { ...MAX_SCORE, total: MAX_TOTAL } }, null, 2));
console.log(
  `unit=${score.unit}/${MAX_SCORE.unit} ui=${score.ui}/${MAX_SCORE.ui} ` +
    `arch=${score.arch}/${MAX_SCORE.arch} total=${score.total}/${MAX_TOTAL}`,
);
