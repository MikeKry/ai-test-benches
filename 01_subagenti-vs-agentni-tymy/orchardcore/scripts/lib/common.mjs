// Shared helpers for the Node scripts (aggregate, score-report).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Benchmark modes, in display order. Keep in sync with MODES in common.sh. */
export const MODES = ['single', 'subagents', 'team'];

/** Number of hidden test cases (theory rows count separately) per database provider. */
export const HIDDEN_TESTS = 19;

export const resultsDir = () => process.env.BENCH_RESULTS_DIR ?? join(ROOT, 'results');

/** Parses `KEY=VALUE` lines; blank lines and `#` comments are ignored, surrounding quotes stripped. */
export function parseKeyValues(text) {
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const eq = trimmed.indexOf('=');
    if (!trimmed || trimmed.startsWith('#') || eq < 1) continue;
    const value = trimmed.slice(eq + 1).replace(/^(["'])(.*)\1$/, '$2');
    entries.push([trimmed.slice(0, eq).trim(), value]);
  }
  return Object.fromEntries(entries);
}

export function readKeyValues(file) {
  return existsSync(file) ? parseKeyValues(readFileSync(file, 'utf8')) : {};
}

/** Returns the parsed JSON file, or null when it is missing or invalid. */
export function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function fail(message, code = 1) {
  console.error(`ERROR: ${message}`);
  process.exit(code);
}
