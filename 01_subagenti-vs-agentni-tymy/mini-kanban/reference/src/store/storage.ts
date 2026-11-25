import { createBoard, type Board, type Card } from '../domain/board';

const KEY = 'kanban.board.v2';
const LEGACY_KEY = 'kanban-board';

const normalize = (raw: string): Board => {
  const data = JSON.parse(raw) as { cards: Partial<Card>[] };
  return { cards: data.cards.map((c) => ({ priority: 'medium', ...c }) as Card) };
};

export function loadBoard(): Board {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    return raw ? normalize(raw) : createBoard();
  } catch {
    return createBoard();
  }
}

export const saveBoard = (board: Board) => localStorage.setItem(KEY, JSON.stringify(board));
