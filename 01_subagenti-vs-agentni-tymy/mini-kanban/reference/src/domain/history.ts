import type { Board } from './board';

export const HISTORY_LIMIT = 50;
export type History = { past: Board[]; present: Board; future: Board[] };

export const createHistory = (present: Board): History => ({ past: [], present, future: [] });

export function commit(history: History, board: Board): History {
  if (board === history.present) return history;
  return { past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: board, future: [] };
}

export const canUndo = (h: History) => h.past.length > 0;
export const canRedo = (h: History) => h.future.length > 0;

export function undo(h: History): History {
  if (!canUndo(h)) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function redo(h: History): History {
  if (!canRedo(h)) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}
