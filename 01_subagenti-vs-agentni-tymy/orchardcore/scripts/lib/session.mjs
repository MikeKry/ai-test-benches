// Reading and classifying the result of one `claude -p --output-format json` run.
import { readJson } from './common.mjs';

const EXIT_TIMEOUT = 124; // exit code of `timeout` when the run hit the time limit

/** The CLI prints one result object; stream-style output is an array of events. */
export function readSession(file) {
  const json = readJson(file);
  if (Array.isArray(json)) return [...json].reverse().find((e) => e?.type === 'result') ?? {};
  return json ?? {};
}

/** Token counts of a session result, or null when it carries no usage data. */
export function readTokens(session) {
  const perModel = session.modelUsage ? Object.values(session.modelUsage) : [];
  if (perModel.length === 0 && !session.usage) return null;
  const total = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 };
  if (perModel.length > 0) {
    // modelUsage aggregates all models, including subagents, so it is preferred over `usage`.
    for (const m of perModel) {
      total.input += m.inputTokens ?? 0;
      total.output += m.outputTokens ?? 0;
      total.cacheCreate += m.cacheCreationInputTokens ?? 0;
      total.cacheRead += m.cacheReadInputTokens ?? 0;
    }
  } else {
    total.input = session.usage.input_tokens ?? 0;
    total.output = session.usage.output_tokens ?? 0;
    total.cacheCreate = session.usage.cache_creation_input_tokens ?? 0;
    total.cacheRead = session.usage.cache_read_input_tokens ?? 0;
  }
  return total;
}

/**
 * A run is invalid when the CLI never reached the model (expired login, API error, bad flags):
 * there is nothing to measure and scoring the empty workspace would only distort the averages.
 * A run that hit the time limit or the turn limit did real work and stays valid.
 */
export function classifyRun(session, exitCode) {
  const tokens = readTokens(session);
  const message = typeof session.result === 'string' ? session.result.replace(/\s+/g, ' ').trim() : '';
  const timedOut = Number(exitCode) === EXIT_TIMEOUT;
  // The account refused the request (usage/spend limit, expired login): no real work, even if a
  // few tokens were counted.
  const accountError = session.is_error === true && /usage limit|spend limit|limit reached|authenticate|login/i.test(message);
  if (accountError && !timedOut) return { valid: false, reason: message.slice(0, 160) };

  const usedModel = tokens !== null && tokens.input + tokens.output + tokens.cacheCreate + tokens.cacheRead > 0;
  if (usedModel || timedOut) return { valid: true, reason: '' };
  return {
    valid: false,
    reason: message.slice(0, 160) || `claude exited with ${exitCode ?? '?'} without using the model`,
  };
}
