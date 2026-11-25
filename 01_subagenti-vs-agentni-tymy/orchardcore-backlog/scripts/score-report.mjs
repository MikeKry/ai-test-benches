#!/usr/bin/env node
// Combines the automatic checks of one V3 run into score.json and prints a one-line summary.
// Usage: node scripts/score-report.mjs <output-dir>
//
// Reads what score.sh and run.sh wrote:
//   regression-<project>.xml   the scored test projects after the run (incl. the agent's tests)
//   base-check-<project>.xml   the agent's tests on the unchanged base commit
//   commit-subjects.txt, backlog-status.txt, changed-files.txt, build.status
// and baseline/regression-<project>.xml. A missing XML counts as no tests (see the *.log files).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ISSUES, ROOT, TEST_PROJECTS, fail } from './lib/common.mjs';

const dir = process.argv[2];
if (!dir) fail('usage: node scripts/score-report.mjs <output-dir>', 2);

/** Map of "<project>|<test name>" -> 'Pass' | 'Fail' | 'Skip' | 'NotRun', or null when no file exists. */
function readResults(prefix, base = dir) {
  const results = new Map();
  let found = false;
  for (const project of TEST_PROJECTS) {
    const file = join(base, `${prefix}-${project}.xml`);
    if (!existsSync(file)) continue;
    found = true;
    for (const m of readFileSync(file, 'utf8').matchAll(/<test\b[^>]*?\bname="([^"]*)"[^>]*?\bresult="([^"]*)"/g)) {
      results.set(`${project}|${m[1]}`, m[2]);
    }
  }
  return found ? results : null;
}

const failing = (results) => [...(results ?? new Map())].filter(([, r]) => r === 'Fail').map(([name]) => name);
// Theory names carry their arguments, e.g. Foo.Bar(x: 1); the method is what identifies a test.
const method = (name) => name.replace(/\(.*$/, '');
const read = (file) => (existsSync(join(dir, file)) ? readFileSync(join(dir, file), 'utf8').trim() : '');
const lines = (file) => read(file).split(/\r?\n/).filter(Boolean);

const isBaseline = dir.replace(/[\\/]+$/, '') === join(ROOT, 'baseline');
const baseline = (isBaseline ? null : readResults('regression', join(ROOT, 'baseline'))) ?? new Map();
const baselineFailures = new Set(failing(baseline));
const after = readResults('regression');
const baseCheck = readResults('base-check');

const newTests = after ? [...after.keys()].filter((name) => !baseline.has(name)) : [];
const newMethods = new Set(newTests.map(method));
const subjects = lines('commit-subjects.txt');
const changed = lines('changed-files.txt').map((l) => l.split(/\t/).pop());
const scoredProject = (path) => TEST_PROJECTS.some((p) => path.startsWith(`test/${p}/`));

const score = {
  build: read('build.status') || 'unknown',
  tests_run: after ? after.size : 0,
  // Tests of the base commit that fail now but passed before.
  regressions: after ? failing(after).filter((n) => baseline.has(n) && !baselineFailures.has(n)) : null,
  agent_tests: newTests.length,
  agent_tests_passing: after ? newTests.filter((n) => after.get(n) === 'Pass').length : 0,
  // New tests that fail on the base commit, i.e. tests that detect the missing change.
  agent_tests_failing_on_base: baseCheck
    ? failing(baseCheck).filter((n) => newMethods.has(method(n)) && !baselineFailures.has(n)).length
    : null,
  base_check_excluded_files: lines('base-check-excluded.txt').length,
  base_check: read('base-check-status.txt') || 'did not build or apply',
  commits: subjects.length,
  // Issues with at least one commit whose subject starts with "#<n>:" (or "#<n> ").
  issues_committed: ISSUES.filter((n) => subjects.some((s) => new RegExp(`^#${n}\\b`).test(s))),
  backlog_md: read('backlog-status.txt') || 'unknown',
  release_notes_changed: changed.some((p) => p.startsWith('src/docs/releases/')),
  // Test files changed outside the scored projects: their tests are not run here (reported to the review).
  test_files_outside_scored_projects: changed.filter((p) => p.startsWith('test/') && !scoredProject(p)),
};

writeFileSync(join(dir, 'score.json'), JSON.stringify(score, null, 2));
console.log(
  `build=${score.build} tests_run=${score.tests_run} regressions=${score.regressions?.length ?? '-'} ` +
    `agent_tests=${score.agent_tests_passing}/${score.agent_tests} ` +
    `fail_on_base=${score.agent_tests_failing_on_base ?? score.base_check} ` +
    `issues_committed=${score.issues_committed.length}/${ISSUES.length} backlog=${score.backlog_md}`,
);
