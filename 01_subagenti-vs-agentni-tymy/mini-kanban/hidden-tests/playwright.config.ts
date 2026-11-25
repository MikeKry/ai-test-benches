import { defineConfig } from '@playwright/test';

// BENCH_WS = absolute path of the workspace under test (set by scripts/score.sh).
// Playwright starts and stops the workspace's dev server itself.
const PORT = 5173;
const workspace = process.env.BENCH_WS;
if (!workspace) throw new Error('BENCH_WS is not set');

export default defineConfig({
  testDir: '.',
  testMatch: /ui\.spec\.ts/,
  timeout: 15_000,
  retries: 0,
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    cwd: workspace,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
