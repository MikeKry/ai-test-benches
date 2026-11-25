import { useEffect, useState } from 'react';
import {
  addCard, deleteCard, filterCards, moveCard, renameCard, setPriority, sortCards,
  type Board, type Column, type Priority,
} from '../domain/board';
import { canRedo, canUndo, commit, createHistory, redo, undo } from '../domain/history';
import { loadBoard, saveBoard } from '../store/storage';

const COLUMNS: { id: Column; label: string }[] = [
  { id: 'todo', label: 'Todo' },
  { id: 'doing', label: 'Doing' },
  { id: 'done', label: 'Done' },
];
const PRIORITIES: Priority[] = ['low', 'medium', 'high'];
const MESSAGES: Record<string, string> = {
  WIP_LIMIT: 'WIP limit reached in Doing',
  HIGH_LIMIT: 'Only one high-priority card allowed in Doing',
};

export function App() {
  const [history, setHistory] = useState(() => createHistory(loadBoard()));
  const [title, setTitle] = useState('');
  const [priority, setNewPriority] = useState<Priority>('medium');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const board = history.present;

  useEffect(() => saveBoard(board), [board]);

  const apply = (next: Board) => { setHistory(commit(history, next)); setError(''); };
  const attempt = (fn: () => Board) => {
    try { apply(fn()); return true; } catch (e) { setError((e as Error).message); return false; }
  };
  const result = (r: { ok: true; board: Board } | { ok: false; error: string }) =>
    r.ok ? apply(r.board) : setError(MESSAGES[r.error] ?? `Cannot do that (${r.error})`);
  const step = (fn: typeof undo) => { setHistory(fn(history)); setError(''); };
  const matching = new Set(filterCards(board, query).map((c) => c.id));

  return (
    <main>
      <h1>Mini Kanban</h1>
      <form onSubmit={(e) => { e.preventDefault(); if (attempt(() => addCard(board, title, priority))) setTitle(''); }}>
        <input data-testid="new-card-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select data-testid="priority-select" value={priority} onChange={(e) => setNewPriority(e.target.value as Priority)}>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button type="submit" data-testid="add-card-button">Add</button>
      </form>
      <input data-testid="search-input" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
      <button data-testid="undo-button" disabled={!canUndo(history)} onClick={() => step(undo)}>Undo</button>
      <button data-testid="redo-button" disabled={!canRedo(history)} onClick={() => step(redo)}>Redo</button>
      {error && <p data-testid="error-message" role="alert">{error}</p>}
      <div style={{ display: 'flex', gap: 16 }}>
        {COLUMNS.map((col) => {
          const cards = sortCards(board.cards.filter((c) => c.column === col.id && matching.has(c.id)));
          return (
            <section key={col.id} data-testid={`column-${col.id}`} style={{ flex: 1 }}>
              <h2>{col.label} <span data-testid={`count-${col.id}`}>{board.cards.filter((c) => c.column === col.id).length}</span></h2>
              {cards.map((c) => (
                <div key={c.id} data-testid="card">
                  {editing?.id === c.id ? (
                    <>
                      <input data-testid="edit-input" value={editing.text} onChange={(e) => setEditing({ id: c.id, text: e.target.value })} />
                      <button data-testid="save-edit" onClick={() => { if (attempt(() => renameCard(board, c.id, editing.text))) setEditing(null); }}>Save</button>
                    </>
                  ) : (
                    <>
                      <span>{c.title}</span>
                      <button data-testid="edit-card" onClick={() => setEditing({ id: c.id, text: c.title })}>edit</button>
                    </>
                  )}
                  <select
                    data-testid="card-priority"
                    value={c.priority}
                    onChange={(e) => result(setPriority(board, c.id, e.target.value as Priority))}
                  >
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <button data-testid="move-back" onClick={() => result(moveCard(board, c.id, 'back'))}>&larr;</button>
                  <button data-testid="move-forward" onClick={() => result(moveCard(board, c.id, 'forward'))}>&rarr;</button>
                  <button data-testid="delete-card" onClick={() => apply(deleteCard(board, c.id))}>x</button>
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </main>
  );
}
