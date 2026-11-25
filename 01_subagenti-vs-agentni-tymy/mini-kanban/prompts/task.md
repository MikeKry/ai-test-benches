# Task: Mini Kanban

Build a Kanban app in the current (empty) directory. Work fully autonomously, do not ask questions.

Stack: React + TypeScript + Vite, no backend, data stored in `localStorage`.
The board has three columns: Todo, Doing, Done.

## Requirements

1. **Architecture.** Separate layers: data (`src/store/`), domain logic (`src/domain/`) and UI (`src/components/`).
   Domain logic must NOT import React and must not import the store or the UI. `localStorage` is used
   only in `src/store/`. Add a short `ARCHITECTURE.md` describing the layers.
2. **Logic.** Add, move, delete, rename cards and set their priority. Limits: at most 3 cards in Doing
   (WIP limit) and at most 1 high-priority card in Doing. A card moves only one column forward or back.
3. **Search and order.** Cards can be filtered by title. Within a column, cards are ordered by priority.
4. **History.** Every change to the board can be undone and redone.
5. **UI.** Everything above is reachable from the UI, errors are shown visibly, the board survives a page reload.

## Fixed interface (follow it literally, acceptance tests depend on it)

### `src/domain/board.ts`

Exports the types `Column = 'todo' | 'doing' | 'done'`, `Priority = 'low' | 'medium' | 'high'`,
`Card = { id: string; title: string; column: Column; priority: Priority }`, `Board = { cards: Card[] }`
and these functions/constants:

- `WIP_LIMIT = 3`, `HIGH_LIMIT = 1`
- `createBoard(): Board`
- `addCard(board, title, priority = 'medium'): Board`. The new card goes to `todo` and is appended at the end
  of `cards`. The title is trimmed. An empty or whitespace-only title throws an `Error`. Ids are unique.
- `moveCard(board, id, direction: 'forward' | 'back'): { ok: true; board: Board } | { ok: false; error: 'WIP_LIMIT' | 'HIGH_LIMIT' | 'INVALID_MOVE' | 'NOT_FOUND' }`
  - unknown id: `NOT_FOUND`; no column in that direction: `INVALID_MOVE`
  - Entering Doing (from Todo or from Done) is rejected with `WIP_LIMIT` when Doing already holds
    `WIP_LIMIT` cards, otherwise with `HIGH_LIMIT` when the card is high priority and Doing already holds
    `HIGH_LIMIT` high-priority cards. `WIP_LIMIT` is checked first. Leaving Doing is always allowed.
- `deleteCard(board, id): Board` (unknown id: board unchanged)
- `renameCard(board, id, title): Board`. Trims the title, empty or whitespace-only title throws an `Error`
  (also for an unknown id), unknown id leaves the board unchanged. The card keeps its position in `cards`.
- `setPriority(board, id, priority): { ok: true; board: Board } | { ok: false; error: 'HIGH_LIMIT' | 'NOT_FOUND' }`
  Making a card high priority while it is in Doing and Doing already holds another high-priority card
  is rejected with `HIGH_LIMIT`. In any other column, or when lowering/keeping the priority, it always succeeds.
- `filterCards(board, query): Card[]`: cards whose title contains the trimmed query, case-insensitive,
  in the order of `board.cards`. An empty or whitespace-only query returns all cards.
- `sortCards(cards: Card[]): Card[]`: new array ordered high, medium, low; cards of equal priority keep
  their relative order (stable).

All functions are pure: they never mutate their input and unchanged results may share nothing with it.

### `src/domain/history.ts`

Exports `HISTORY_LIMIT = 50`, `type History = { past: Board[]; present: Board; future: Board[] }` and:

- `createHistory(board): History` (empty `past` and `future`)
- `commit(history, board): History`: the old `present` is appended to `past` (only the newest
  `HISTORY_LIMIT` entries are kept), `board` becomes `present`, `future` is cleared.
  If `board` is the identical object as `present` (`===`), `history` is returned unchanged.
- `undo(history)`, `redo(history)`: move one step; when there is nothing to undo/redo the same history is returned.
- `canUndo(history): boolean`, `canRedo(history): boolean`

### Storage

The board is stored as JSON (`Board`) under the `localStorage` key `kanban.board.v2`.
Data of the previous app version lives under the key `kanban-board` (cards without `priority`);
it must still load, with `priority: 'medium'` for such cards. Missing or corrupt data gives an empty board.
Undo history is not persisted: after a reload undo and redo are not available, the board is.

### UI (`data-testid`)

- `new-card-input`, `add-card-button`, `priority-select` (a `<select>` with the options `low`, `medium`, `high`,
  default `medium`; it sets the priority of the card being added)
- `column-todo`, `column-doing`, `column-done`; `count-todo`, `count-doing`, `count-done` (inside the column,
  text is just the number of cards in that column, regardless of the search filter)
- `card` (every card, inside its column), and inside a card: `move-forward`, `move-back`, `delete-card`,
  `edit-card` (opens editing), `edit-input` (text field prefilled with the title), `save-edit` (stores the new title),
  `card-priority` (a `<select>` with the options `low`, `medium`, `high`, showing and changing the card's priority)
- `search-input`: filters the visible cards of all columns by title (`filterCards`)
- `undo-button`, `redo-button`: disabled when nothing can be undone/redone; undo/redo cover add, move, delete,
  rename and priority changes. Rejected actions (errors) create no history entry.
- `error-message`: visible for every rejected action (`WIP_LIMIT`, `HIGH_LIMIT`, empty title when adding or
  renaming) and not present after the next successful action. A failed rename keeps the editor open.
- Cards in each column are displayed in `sortCards` order.
- The app starts with `npm run dev` on port 5173.

## Definition of done

`npm install` works, `npm run dev` serves the app on port 5173, all of the above is implemented.
You may write your own tests. Do not look for or create a `hidden-tests/` directory.
