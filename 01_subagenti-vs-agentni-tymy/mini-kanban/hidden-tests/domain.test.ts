// Alias @workspace -> <workspace>/src (see vitest.config.ts)
import { describe, it, expect } from 'vitest';
import {
  createBoard,
  addCard,
  moveCard,
  deleteCard,
  renameCard,
  setPriority,
  filterCards,
  sortCards,
  WIP_LIMIT,
  HIGH_LIMIT,
  type Board,
  type Card,
  type Priority,
} from '@workspace/domain/board';
import {
  createHistory,
  commit,
  undo,
  redo,
  canUndo,
  canRedo,
  HISTORY_LIMIT,
} from '@workspace/domain/history';

/** Board with one card per priority given, in order; ids returned in the same order. */
const withPriorities = (...priorities: Priority[]) => {
  let board = createBoard();
  priorities.forEach((priority, i) => {
    board = addCard(board, `P${i}`, priority);
  });
  return { board, ids: board.cards.map((card) => card.id) };
};

const withCards = (count: number): Board => {
  let board = createBoard();
  for (let i = 0; i < count; i++) board = addCard(board, `Card ${i}`);
  return board;
};

const move = (board: Board, id: string, direction: 'forward' | 'back'): Board => {
  const result = moveCard(board, id, direction);
  if (!result.ok) throw new Error(result.error);
  return result.board;
};
const moveForward = (board: Board, id: string) => move(board, id, 'forward');

const columnOf = (board: Board, id: string) => board.cards.find((card) => card.id === id)?.column;

/** Board with `count` cards (ids returned in creation order), the first `inDoing` of them moved to Doing. */
const withDoing = (count: number, inDoing: number) => {
  let board = withCards(count);
  const ids = board.cards.map((card) => card.id);
  for (let i = 0; i < inDoing; i++) board = moveForward(board, ids[i]);
  return { board, ids };
};

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};

describe('domain', () => {
  // --- basic behaviour ---------------------------------------------------------------------

  it('1 creates empty board', () => {
    expect(createBoard().cards).toHaveLength(0);
  });

  it('2 adds card to todo', () => {
    const board = addCard(createBoard(), 'A');
    expect(board.cards[0]).toMatchObject({ title: 'A', column: 'todo' });
  });

  it('3 rejects empty title', () => {
    expect(() => addCard(createBoard(), '  ')).toThrow();
  });

  it('4 is pure', () => {
    const board = createBoard();
    addCard(board, 'A');
    expect(board.cards).toHaveLength(0);
  });

  it('5 moves todo -> doing -> done', () => {
    const board = withCards(1);
    const id = board.cards[0].id;
    expect(columnOf(moveForward(moveForward(board, id), id), id)).toBe('done');
  });

  it('6 cannot move forward from done', () => {
    const board = withCards(1);
    const id = board.cards[0].id;
    const done = moveForward(moveForward(board, id), id);
    expect(moveCard(done, id, 'forward')).toEqual({ ok: false, error: 'INVALID_MOVE' });
  });

  it('7 cannot move back from todo', () => {
    const board = withCards(1);
    expect(moveCard(board, board.cards[0].id, 'back')).toEqual({ ok: false, error: 'INVALID_MOVE' });
  });

  it('8 enforces WIP limit', () => {
    const { board, ids } = withDoing(WIP_LIMIT + 1, WIP_LIMIT);
    expect(moveCard(board, ids[WIP_LIMIT], 'forward')).toEqual({ ok: false, error: 'WIP_LIMIT' });
  });

  it('9 deletes card', () => {
    const board = withCards(2);
    expect(deleteCard(board, board.cards[0].id).cards).toHaveLength(1);
  });

  it('10 unknown id returns NOT_FOUND', () => {
    expect(moveCard(withCards(1), 'nope', 'forward')).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  // --- edge cases that follow from the task description -----------------------------------

  it('11 no function mutates its input (deeply frozen board)', () => {
    const { board, ids } = withDoing(3, 1);
    const frozen = deepFreeze(structuredClone(board));
    expect(() => addCard(frozen, 'New')).not.toThrow();
    expect(() => moveCard(frozen, ids[1], 'forward')).not.toThrow();
    expect(() => moveCard(frozen, ids[0], 'back')).not.toThrow();
    expect(() => moveCard(frozen, ids[0], 'forward')).not.toThrow();
    expect(() => deleteCard(frozen, ids[2])).not.toThrow();
    expect(frozen).toEqual(board);
  });

  it('12 rejects every empty or whitespace-only title', () => {
    for (const title of ['', ' ', '   ', '\t', '\n', ' \t\n ']) {
      expect(() => addCard(createBoard(), title), JSON.stringify(title)).toThrow();
    }
  });

  it('13 generates unique ids', () => {
    const ids = withCards(100).cards.map((card) => card.id);
    expect(new Set(ids).size).toBe(100);
  });

  it('14 moving or deleting one card leaves all others untouched', () => {
    const { board, ids } = withDoing(4, 2);
    const others = (b: Board, skip: string) => b.cards.filter((card) => card.id !== skip);

    const moved = moveForward(board, ids[2]);
    expect(others(moved, ids[2])).toEqual(others(board, ids[2]));
    expect(moved.cards).toHaveLength(4);

    const deleted = deleteCard(board, ids[1]);
    expect(deleted.cards).toEqual(others(board, ids[1]));
  });

  it('15 WIP limit only blocks entering Doing, a full Doing can still advance', () => {
    const { board, ids } = withDoing(WIP_LIMIT, WIP_LIMIT);
    const result = moveCard(board, ids[0], 'forward');
    expect(result.ok).toBe(true);
    if (result.ok) expect(columnOf(result.board, ids[0])).toBe('done');
  });

  it('16 a Doing slot is freed when a card leaves it', () => {
    const { board, ids } = withDoing(WIP_LIMIT + 1, WIP_LIMIT);
    expect(moveCard(board, ids[WIP_LIMIT], 'forward')).toMatchObject({ ok: false, error: 'WIP_LIMIT' });

    const afterDone = moveForward(board, ids[0]); // one card leaves Doing for Done
    expect(columnOf(moveForward(afterDone, ids[WIP_LIMIT]), ids[WIP_LIMIT])).toBe('doing');

    const afterBack = move(board, ids[1], 'back'); // ... or goes back to Todo
    expect(columnOf(moveForward(afterBack, ids[WIP_LIMIT]), ids[WIP_LIMIT])).toBe('doing');
  });

  it('17 moving back from Done into a full Doing is rejected with WIP_LIMIT', () => {
    let { board, ids } = withDoing(WIP_LIMIT + 1, 1);
    board = moveForward(board, ids[0]); // first card: Done
    for (let i = 1; i <= WIP_LIMIT; i++) board = moveForward(board, ids[i]); // Doing is full again
    expect(moveCard(board, ids[0], 'back')).toEqual({ ok: false, error: 'WIP_LIMIT' });
  });

  it('18 cards travel back and forth one column at a time', () => {
    let board = withCards(1);
    const id = board.cards[0].id;
    const path: (string | undefined)[] = [columnOf(board, id)];
    for (const direction of ['forward', 'forward', 'back', 'back'] as const) {
      board = move(board, id, direction);
      path.push(columnOf(board, id));
    }
    expect(path).toEqual(['todo', 'doing', 'done', 'doing', 'todo']);
  });

  it('19 deleting an unknown id changes nothing and does not throw', () => {
    const board = withCards(2);
    expect(deleteCard(board, 'nope')).toEqual(board);
  });

  it('20 a deleted card can no longer be moved', () => {
    const board = withCards(2);
    const id = board.cards[0].id;
    const after = deleteCard(board, id);
    expect(moveCard(after, id, 'forward')).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(after.cards.map((card) => card.id)).not.toContain(id);
  });

  // --- priority, HIGH_LIMIT, rename, filter, sort, history ---------------------------------

  it('21 addCard defaults to medium priority, accepts one and trims the title', () => {
    expect(addCard(createBoard(), 'A').cards[0].priority).toBe('medium');
    expect(addCard(createBoard(), '  Padded  ', 'high').cards[0]).toMatchObject({ title: 'Padded', priority: 'high' });
    expect(HIGH_LIMIT).toBe(1);
  });

  it('22 only HIGH_LIMIT high-priority cards may be in Doing', () => {
    const { board, ids } = withPriorities('high', 'high', 'medium');
    const first = moveForward(board, ids[0]);
    expect(moveCard(first, ids[1], 'forward')).toEqual({ ok: false, error: 'HIGH_LIMIT' });
    expect(moveCard(first, ids[2], 'forward').ok).toBe(true); // other priorities are not affected
  });

  it('23 WIP_LIMIT takes precedence over HIGH_LIMIT', () => {
    const { board, ids } = withPriorities('high', 'low', 'low', 'high');
    let b = board;
    for (const id of ids.slice(0, 3)) b = moveForward(b, id); // Doing: high, low, low (full)
    expect(moveCard(b, ids[3], 'forward')).toEqual({ ok: false, error: 'WIP_LIMIT' });
  });

  it('24 HIGH_LIMIT also applies when moving back from Done into Doing', () => {
    const { board, ids } = withPriorities('high', 'high');
    let b = moveForward(moveForward(board, ids[0]), ids[0]); // first high: Done
    b = moveForward(b, ids[1]); // second high: Doing
    expect(moveCard(b, ids[0], 'back')).toEqual({ ok: false, error: 'HIGH_LIMIT' });
    expect(moveCard(moveForward(b, ids[1]), ids[0], 'back').ok).toBe(true); // slot freed
  });

  it('25 setPriority respects HIGH_LIMIT only for a card in Doing', () => {
    const { board, ids } = withPriorities('high', 'medium', 'medium');
    let b = moveForward(board, ids[0]); // high card in Doing
    b = moveForward(b, ids[1]); // medium card in Doing, third stays in Todo
    expect(setPriority(b, ids[1], 'high')).toEqual({ ok: false, error: 'HIGH_LIMIT' });
    expect(setPriority(b, ids[2], 'high').ok).toBe(true); // Todo: no limit
    expect(setPriority(b, ids[0], 'high').ok).toBe(true); // unchanged priority
    expect(setPriority(b, 'nope', 'low')).toEqual({ ok: false, error: 'NOT_FOUND' });
    const lowered = setPriority(b, ids[0], 'low');
    expect(lowered.ok).toBe(true);
    if (lowered.ok) {
      expect(lowered.board.cards.find((c) => c.id === ids[0])?.priority).toBe('low');
      expect(setPriority(lowered.board, ids[1], 'high').ok).toBe(true); // slot is free now
    }
  });

  it('26 renameCard trims, keeps position, validates and is pure', () => {
    const board = withCards(3);
    const frozen = deepFreeze(structuredClone(board));
    const id = board.cards[1].id;
    const renamed = renameCard(frozen, id, '  New name ');
    expect(renamed.cards.map((c) => c.id)).toEqual(board.cards.map((c) => c.id));
    expect(renamed.cards[1].title).toBe('New name');
    expect(renamed.cards[0]).toEqual(board.cards[0]);
    expect(() => renameCard(board, id, '   ')).toThrow();
    expect(renameCard(board, 'nope', 'X')).toEqual(board);
    expect(frozen).toEqual(board);
  });

  it('27 filterCards matches case-insensitively on the trimmed query and keeps order', () => {
    let board = createBoard();
    for (const title of ['Buy milk', 'Write report', 'MILKSHAKE recipe', 'Call Bob']) board = addCard(board, title);
    expect(filterCards(board, ' milk ').map((c) => c.title)).toEqual(['Buy milk', 'MILKSHAKE recipe']);
    expect(filterCards(board, 'REPORT')).toHaveLength(1);
    expect(filterCards(board, 'zzz')).toHaveLength(0);
    expect(filterCards(board, '')).toHaveLength(4);
    expect(filterCards(board, '   ')).toHaveLength(4);
  });

  it('28 sortCards orders high, medium, low, is stable and does not mutate', () => {
    const { board, ids } = withPriorities('low', 'high', 'medium', 'low', 'high', 'medium');
    const frozenCards = deepFreeze(structuredClone(board.cards)) as Card[];
    const sorted = sortCards(frozenCards);
    expect(sorted.map((c) => c.id)).toEqual([ids[1], ids[4], ids[2], ids[5], ids[0], ids[3]]);
    expect(sorted).not.toBe(frozenCards);
    expect(frozenCards.map((c) => c.id)).toEqual(ids);
  });

  it('29 history commit, undo and redo', () => {
    const a = withCards(1);
    const b = addCard(a, 'B');
    const c = addCard(b, 'C');
    let h = createHistory(a);
    expect(canUndo(h) || canRedo(h)).toBe(false);
    h = commit(commit(h, b), c);
    expect(h.present).toBe(c);
    expect(h.past).toEqual([a, b]);
    expect(commit(h, c)).toBe(h); // identical board: no new entry
    h = undo(undo(h));
    expect(h.present).toBe(a);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(true);
    expect(h.future).toEqual([b, c]);
    h = redo(h);
    expect(h.present).toBe(b);
    h = commit(h, addCard(b, 'D')); // a new change clears the redo stack
    expect(h.future).toEqual([]);
    expect(canRedo(h)).toBe(false);
    expect(h.past).toEqual([a, b]);
  });

  it('30 history is bounded and undo/redo at the ends are no-ops', () => {
    expect(HISTORY_LIMIT).toBe(50);
    let board = createBoard();
    let h = createHistory(board);
    const boards: Board[] = [board];
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
      board = addCard(board, `C${i}`);
      boards.push(board);
      h = commit(h, board);
    }
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toBe(boards[10]); // the oldest 10 entries were dropped
    let undone = h;
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) undone = undo(undone);
    expect(undone.present).toBe(boards[10]);
    expect(undo(undone)).toBe(undone);
    expect(redo(h)).toBe(h);
  });
});
