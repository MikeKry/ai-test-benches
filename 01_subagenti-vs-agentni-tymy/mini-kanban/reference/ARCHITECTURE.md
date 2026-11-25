# Architecture

- `src/domain/` - pure logic: `board.ts` (cards, moves, WIP and high-priority limits, rename, priority, filter, sort) and `history.ts` (undo/redo). No React, no I/O.
- `src/store/` - persistence of the board in `localStorage`, including migration of legacy data.
- `src/components/` - React UI. Calls domain functions and the store, holds no business rules.
