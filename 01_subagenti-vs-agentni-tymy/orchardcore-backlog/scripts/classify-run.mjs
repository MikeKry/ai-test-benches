#!/usr/bin/env node
// Classifies one finished run and records the verdict in its metrics.env.
// Usage: node scripts/classify-run.mjs <run-dir>
// Prints "valid" or "invalid: <reason>" and appends validity=... (and invalid_reason=...) to metrics.env.
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, readKeyValues } from './lib/common.mjs';
import { classifyRun, readSession } from './lib/session.mjs';

const dir = process.argv[2];
if (!dir) fail('usage: node scripts/classify-run.mjs <run-dir>', 2);

const metricsFile = join(dir, 'metrics.env');
const { claude_exit: exitCode } = readKeyValues(metricsFile);
const verdict = classifyRun(readSession(join(dir, 'session.json')), exitCode);

appendFileSync(metricsFile, `validity=${verdict.valid ? 'valid' : 'invalid'}\n`);
if (!verdict.valid) appendFileSync(metricsFile, `invalid_reason=${verdict.reason}\n`);
console.log(verdict.valid ? 'valid' : `invalid: ${verdict.reason}`);
