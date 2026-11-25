#!/usr/bin/env node
// Aggregates all runs into results/summary.csv and results/summary.md (mean +/- sample std. dev.).
// Invalid runs (claude never reached the model) stay in the CSV but are excluded from the averages.
// Usage: node scripts/aggregate.mjs
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HIDDEN_TESTS, MODES, fail, readJson, readKeyValues, resultsDir } from './lib/common.mjs';
import { classifyRun, readSession, readTokens } from './lib/session.mjs';

if (process.argv.includes('--help')) {
  console.log('Usage: node scripts/aggregate.mjs\nReads <results>/*/{metrics.env,session.json,score.json}.');
  process.exit(0);
}

function readRun(dir) {
  const metrics = readKeyValues(join(dir, 'metrics.env'));
  const score = readJson(join(dir, 'score.json'));
  const session = readSession(join(dir, 'session.json'));
  const verdict = classifyRun(session, metrics.claude_exit);
  const tokens = readTokens(session);
  const tokensIo = tokens ? tokens.input + tokens.output : null;

  return {
    mode: metrics.mode,
    run: Number(metrics.run),
    valid: verdict.valid,
    invalid_reason: verdict.reason.replaceAll(',', ';'),
    hidden_total: score?.hidden_total ?? '',
    hidden_max: score?.max?.hidden_total ?? '',
    hidden_sqlite: score?.hidden_sqlite ?? '',
    hidden_postgres: score?.hidden_postgres ?? '',
    regressions: score?.regressions?.length ?? '',
    agent_tests: score?.agent_tests ?? '',
    agent_tests_passing: score?.agent_tests_passing ?? '',
    agent_tests_failing_on_base: score?.agent_tests_failing_on_base ?? '',
    catches_bug: score ? (score.agent_tests_failing_on_base > 0 ? 1 : 0) : '',
    build_ok: score ? (score.build === 'ok' ? 1 : 0) : '',
    committed: metrics.agent_commits > 0 ? 1 : 0,
    duration_s: Number(metrics.duration_s) || 0,
    claude_exit: metrics.claude_exit,
    turns: session.num_turns ?? '',
    tokens_input: tokens?.input ?? '',
    tokens_output: tokens?.output ?? '',
    tokens_cache_create: tokens?.cacheCreate ?? '',
    tokens_cache_read: tokens?.cacheRead ?? '',
    tokens_io: tokensIo ?? '',
    tokens_all: tokens ? tokensIo + tokens.cacheCreate + tokens.cacheRead : '',
    cost_usd: session.total_cost_usd ?? '',
    model: metrics.model,
    claude_version: metrics.claude_version,
    base_commit: metrics.base_commit,
    start_utc: metrics.start_utc,
    end_utc: metrics.end_utc,
  };
}

function loadRuns(root) {
  return readdirSync(root)
    .sort()
    .map((name) => join(root, name))
    .filter((dir) => statSync(dir).isDirectory() && existsSync(join(dir, 'metrics.env')))
    .map(readRun);
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const stdDev = (xs) => (xs.length < 2 ? 0 : Math.sqrt(xs.reduce((s, x) => s + (x - mean(xs)) ** 2, 0) / (xs.length - 1)));
const numbers = (xs) => xs.filter((x) => x !== '' && Number.isFinite(Number(x))).map(Number);
const format = (xs, digits = 1) => {
  const values = numbers(xs);
  return values.length ? `${mean(values).toFixed(digits)} ± ${stdDev(values).toFixed(digits)}` : '-';
};
const share = (xs) => {
  const values = numbers(xs);
  return values.length ? `${values.filter((x) => x > 0).length}/${values.length}` : '-';
};

function renderCsv(rows) {
  const columns = Object.keys(rows[0]);
  return [columns.join(','), ...rows.map((r) => columns.map((c) => r[c]).join(','))].join('\n') + '\n';
}

function renderMarkdown(rows) {
  const lines = [
    `| Mode | n | Hidden tests /${HIDDEN_TESTS * 2} | Regressions | Own tests | Catch the bug | Builds | Time s | Tokens in+out | Tokens all | Cost USD |`,
    '|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const mode of MODES) {
    const all = rows.filter((r) => r.mode === mode);
    if (all.length === 0) continue;
    const g = all.filter((r) => r.valid);
    const invalid = all.length - g.length;
    const col = (key) => g.map((r) => r[key]);
    lines.push(
      `| ${mode} | ${g.length}${invalid ? ` (+${invalid} invalid)` : ''} | ${format(col('hidden_total'))} | ` +
        `${format(col('regressions'))} | ${format(col('agent_tests'))} | ${share(col('catches_bug'))} | ${share(col('build_ok'))} | ` +
        `${format(col('duration_s'), 0)} | ${format(col('tokens_io'), 0)} | ${format(col('tokens_all'), 0)} | ` +
        `${format(col('cost_usd'), 3)} |`,
    );
  }
  return (
    `${lines.join('\n')}\n\nValues are mean ± sample standard deviation over valid runs. ` +
    `Hidden tests run once on SQLite and once on PostgreSQL (${HIDDEN_TESTS} each). ` +
    '"Catch the bug": runs whose own tests fail on the unfixed base commit.\n'
  );
}

const root = resultsDir();
if (!existsSync(root)) fail(`no results directory at ${root}`);
const rows = loadRuns(root);
if (rows.length === 0) fail(`no runs found in ${root}`);

for (const r of rows.filter((x) => !x.valid)) console.warn(`WARN: ${r.mode} #${r.run} is invalid and excluded: ${r.invalid_reason}`);
for (const r of rows.filter((x) => x.valid && x.hidden_total === '')) console.warn(`WARN: ${r.mode} #${r.run} was not scored`);
for (const r of rows.filter((x) => x.valid && x.claude_exit !== '0')) console.warn(`WARN: ${r.mode} #${r.run} claude exit ${r.claude_exit} (counted)`);

const markdown = renderMarkdown(rows);
writeFileSync(join(root, 'summary.csv'), renderCsv(rows));
writeFileSync(join(root, 'summary.md'), markdown);
console.log(markdown);
