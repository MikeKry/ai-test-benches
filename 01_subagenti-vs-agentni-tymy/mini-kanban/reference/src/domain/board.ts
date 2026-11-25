export type Column = 'todo' | 'doing' | 'done';
export type Priority = 'low' | 'medium' | 'high';
export type Card = { id: string; title: string; column: Column; priority: Priority };
export type Board = { cards: Card[] };

export const WIP_LIMIT = 3;
export const HIGH_LIMIT = 1;
const ORDER: Column[] = ['todo', 'doing', 'done'];
const RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export type MoveResult =
  | { ok: true; board: Board }
  | { ok: false; error: 'WIP_LIMIT' | 'HIGH_LIMIT' | 'INVALID_MOVE' | 'NOT_FOUND' };

export type PriorityResult =
  | { ok: true; board: Board }
  | { ok: false; error: 'HIGH_LIMIT' | 'NOT_FOUND' };

export const createBoard = (): Board => ({ cards: [] });

function cleanTitle(title: string): string {
  const t = title.trim();
  if (!t) throw new Error('Title must not be empty');
  return t;
}

const countIn = (board: Board, column: Column, priority?: Priority) =>
  board.cards.filter((c) => c.column === column && (!priority || c.priority === priority)).length;

export function addCard(board: Board, title: string, priority: Priority = 'medium'): Board {
  const card: Card = { id: crypto.randomUUID(), title: cleanTitle(title), column: 'todo', priority };
  return { cards: [...board.cards, card] };
}

export function moveCard(board: Board, id: string, direction: 'forward' | 'back'): MoveResult {
  const card = board.cards.find((c) => c.id === id);
  if (!card) return { ok: false, error: 'NOT_FOUND' };
  const target = ORDER[ORDER.indexOf(card.column) + (direction === 'forward' ? 1 : -1)];
  if (!target) return { ok: false, error: 'INVALID_MOVE' };
  if (target === 'doing') {
    if (countIn(board, 'doing') >= WIP_LIMIT) return { ok: false, error: 'WIP_LIMIT' };
    if (card.priority === 'high' && countIn(board, 'doing', 'high') >= HIGH_LIMIT) {
      return { ok: false, error: 'HIGH_LIMIT' };
    }
  }
  return { ok: true, board: { cards: board.cards.map((c) => (c.id === id ? { ...c, column: target } : c)) } };
}

export const deleteCard = (board: Board, id: string): Board => ({
  cards: board.cards.filter((c) => c.id !== id),
});

export function renameCard(board: Board, id: string, title: string): Board {
  const t = cleanTitle(title);
  return { cards: board.cards.map((c) => (c.id === id ? { ...c, title: t } : c)) };
}

export function setPriority(board: Board, id: string, priority: Priority): PriorityResult {
  const card = board.cards.find((c) => c.id === id);
  if (!card) return { ok: false, error: 'NOT_FOUND' };
  if (priority === 'high' && card.priority !== 'high' && card.column === 'doing'
    && countIn(board, 'doing', 'high') >= HIGH_LIMIT) {
    return { ok: false, error: 'HIGH_LIMIT' };
  }
  return { ok: true, board: { cards: board.cards.map((c) => (c.id === id ? { ...c, priority } : c)) } };
}

export function filterCards(board: Board, query: string): Card[] {
  const q = query.trim().toLowerCase();
  return board.cards.filter((c) => c.title.toLowerCase().includes(q));
}

export const sortCards = (cards: Card[]): Card[] =>
  cards
    .map((card, index) => ({ card, index }))
    .sort((a, b) => RANK[a.card.priority] - RANK[b.card.priority] || a.index - b.index)
    .map((x) => x.card);
