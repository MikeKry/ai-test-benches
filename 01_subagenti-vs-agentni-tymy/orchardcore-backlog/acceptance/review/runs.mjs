// Runs that take part in a review round and where their files are.
// Round 1 (results/review): the 9 runs in results/ (single, subagents, team = named agents under -p).
// Round 2 (REVIEW_DIR=review2 REVIEW_INCLUDE_INTERACTIVE=1): the same 9 plus the real agent-team runs of
// amendment A2 from results-interactive/, under the mode name "teamreal" (teamreal_N = results-interactive/team_N).
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const root = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
export const reviewDir = join(root, 'results', process.env.REVIEW_DIR ?? 'review');
const interactive = process.env.REVIEW_INCLUDE_INTERACTIVE === '1';

export function listRuns() {
  const runs = readdirSync(join(root, 'results')).filter((d) => /^(single|subagents|team)_\d+$/.test(d));
  if (interactive && existsSync(join(root, 'results-interactive'))) {
    runs.push(...readdirSync(join(root, 'results-interactive')).filter((d) => /^team_\d+$/.test(d)).map((d) => `teamreal_${d.split('_')[1]}`));
  }
  return runs.sort();
}

export const modesOf = (runs) => [...new Set(runs.map((r) => r.split('_')[0]))];

export function resultDir(run) {
  return run.startsWith('teamreal_') ? join(root, 'results-interactive', `team_${run.split('_')[1]}`) : join(root, 'results', run);
}

export function workspaceDir(run) {
  return run.startsWith('teamreal_') ? join(root, 'workspaces-interactive', `team_${run.split('_')[1]}`) : join(root, 'workspaces', run);
}
