#!/usr/bin/env node
// Combines the test results of one run into score.json and prints a one-line summary.
// Usage: node scripts/score-report.mjs <output-dir>
//
// Reads the xUnit XML files written by score.sh and baseline/regression.xml:
//   hidden-sqlite.xml, hidden-postgres.xml  hidden tests (quality of the fix)
//   regression.xml                          the rest of OrchardCore.Tests, including the agent's tests
//   base-check.xml                          the agent's tests on the unfixed base commit
// A missing file counts as 0 passed tests (see the *.log files for the reason).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HIDDEN_TESTS, ROOT, fail } from './lib/common.mjs';

const dir = process.argv[2];
if (!dir) fail('usage: node scripts/score-report.mjs <output-dir>', 2);

/** Map of test name -> 'Pass' | 'Fail' | 'Skip' | 'NotRun', or null when the file is missing. */
function readResults(file) {
  if (!existsSync(file)) return null;
  const results = new Map();
  for (const match of readFileSync(file, 'utf8').matchAll(/<test\b[^>]*?\bname="([^"]*)"[^>]*?\bresult="([^"]*)"/g)) {
    results.set(match[1], match[2]);
  }
  return results;
}

const failing = (results) => [...(results ?? new Map())].filter(([, r]) => r === 'Fail').map(([name]) => name);
const passed = (results) => [...(results ?? new Map()).values()].filter((r) => r === 'Pass').length;
// Theory names carry their arguments, e.g. Foo.Bar(culture: "en-GB"); the method is what identifies a test.
const method = (name) => name.replace(/\(.*$/, '');

const baseline = readResults(join(ROOT, 'baseline', 'regression.xml')) ?? new Map();
const baselineFailures = new Set(failing(baseline));
const sqlite = readResults(join(dir, 'hidden-sqlite.xml'));
const postgres = readResults(join(dir, 'hidden-postgres.xml'));
const regression = readResults(join(dir, 'regression.xml'));
const baseCheck = readResults(join(dir, 'base-check.xml'));

const newTests = regression ? [...regression.keys()].filter((name) => !baseline.has(name)) : [];
const newMethods = new Set(newTests.map(method));
const read = (file) => (existsSync(join(dir, file)) ? readFileSync(join(dir, file), 'utf8').trim() : '');

const score = {
  build: read('build.status') || 'unknown',
  hidden_sqlite: passed(sqlite),
  hidden_postgres: postgres ? passed(postgres) : null,
  // Tests of the base commit that fail now but passed before the change.
  regressions: regression ? failing(regression).filter((name) => baseline.has(name) && !baselineFailures.has(name)) : null,
  agent_tests: newTests.length,
  agent_tests_passing: regression ? newTests.filter((name) => regression.get(name) === 'Pass').length : 0,
  // New tests that fail on the base commit, i.e. tests that actually detect the bug.
  agent_tests_failing_on_base: baseCheck
    ? failing(baseCheck).filter((name) => newMethods.has(method(name)) && !baselineFailures.has(name)).length
    : null,
  // Agent test files that need the fix to compile and were therefore left out of the base check.
  base_check_excluded_files: read('base-check-excluded.txt').split(/\s+/).filter(Boolean).length,
  base_check: baseCheck ? 'ran' : read('base-check-build.log') === 'no test changes' ? 'no test changes' : 'did not build or apply',
};
score.hidden_total = score.hidden_sqlite + (score.hidden_postgres ?? 0);
const max = { hidden_sqlite: HIDDEN_TESTS, hidden_postgres: postgres ? HIDDEN_TESTS : 0 };
max.hidden_total = max.hidden_sqlite + max.hidden_postgres;

writeFileSync(join(dir, 'score.json'), JSON.stringify({ ...score, max }, null, 2));
console.log(
  `hidden=${score.hidden_total}/${max.hidden_total} (sqlite ${score.hidden_sqlite}, postgres ${score.hidden_postgres ?? '-'}) ` +
    `regressions=${score.regressions?.length ?? '-'} agent_tests=${score.agent_tests_passing}/${score.agent_tests} ` +
    `catch_bug=${score.agent_tests_failing_on_base ?? score.base_check} build=${score.build}`,
);
