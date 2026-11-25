import { defineConfig } from 'vitest/config';
import path from 'node:path';

// BENCH_WS = absolute path of the workspace under test (set by scripts/score.sh)
const ws = process.env.BENCH_WS;
if (!ws) throw new Error('BENCH_WS is not set');

export default defineConfig({
  resolve: { alias: { '@workspace': path.resolve(ws, 'src') } },
  test: { include: ['domain.test.ts'] },
});
