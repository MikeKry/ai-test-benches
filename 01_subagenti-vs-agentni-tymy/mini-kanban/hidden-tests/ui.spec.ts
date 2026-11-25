import { test, expect, type Page } from '@playwright/test';

const addCard = async (page: Page, title: string) => {
  await page.getByTestId('new-card-input').fill(title);
  await page.getByTestId('add-card-button').click();
};

const column = (page: Page, name: 'todo' | 'doing' | 'done') => page.getByTestId(`column-${name}`);
const cardIn = (page: Page, name: 'todo' | 'doing' | 'done', title: string) =>
  column(page, name).getByTestId('card').filter({ hasText: title });
const firstCard = (page: Page) => page.getByTestId('card').first();

/** Moves the card with the given title one column forward (it must currently be in `from`). */
const advance = (page: Page, from: 'todo' | 'doing', title: string) =>
  cardIn(page, from, title).getByTestId('move-forward').click();

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('1 add card appears in todo', async ({ page }) => {
  await addCard(page, 'Hello');
  await expect(column(page, 'todo').getByText('Hello')).toBeVisible();
});

test('2 move card to done', async ({ page }) => {
  await addCard(page, 'Ship');
  await firstCard(page).getByTestId('move-forward').click();
  await firstCard(page).getByTestId('move-forward').click();
  await expect(column(page, 'done').getByText('Ship')).toBeVisible();
});

test('3 WIP limit shows error', async ({ page }) => {
  const cardCount = 4; // one more than the WIP limit of 3
  for (let i = 0; i < cardCount; i++) await addCard(page, `C${i}`);
  for (let i = 0; i < cardCount; i++) {
    await column(page, 'todo').getByTestId('card').first().getByTestId('move-forward').click();
  }
  await expect(page.getByTestId('error-message')).toBeVisible();
  await expect(column(page, 'doing').getByTestId('card')).toHaveCount(3);
});

test('4 persists after reload', async ({ page }) => {
  await addCard(page, 'Persist');
  await page.reload();
  await expect(page.getByText('Persist')).toBeVisible();
});

test('5 delete card', async ({ page }) => {
  await addCard(page, 'Gone');
  await firstCard(page).getByTestId('delete-card').click();
  await expect(page.getByText('Gone')).toHaveCount(0);
});

test('6 move-back returns a card to the previous column', async ({ page }) => {
  await addCard(page, 'Back');
  await advance(page, 'todo', 'Back');
  await expect(cardIn(page, 'doing', 'Back')).toHaveCount(1);
  await cardIn(page, 'doing', 'Back').getByTestId('move-back').click();
  await expect(cardIn(page, 'todo', 'Back')).toHaveCount(1);
  await expect(column(page, 'doing').getByTestId('card')).toHaveCount(0);
});

test('7 card positions survive a reload', async ({ page }) => {
  for (const title of ['A', 'B', 'C']) await addCard(page, title);
  await advance(page, 'todo', 'A');
  await advance(page, 'doing', 'A');
  await advance(page, 'todo', 'B');
  await page.reload();
  await expect(cardIn(page, 'done', 'A')).toHaveCount(1);
  await expect(cardIn(page, 'doing', 'B')).toHaveCount(1);
  await expect(cardIn(page, 'todo', 'C')).toHaveCount(1);
});

test('8 deleting a card survives a reload', async ({ page }) => {
  await addCard(page, 'Keep');
  await addCard(page, 'Drop');
  await cardIn(page, 'todo', 'Drop').getByTestId('delete-card').click();
  await page.reload();
  await expect(page.getByTestId('card')).toHaveCount(1);
  await expect(page.getByText('Keep')).toBeVisible();
  await expect(page.getByText('Drop')).toHaveCount(0);
});

test('9 moving back from done into a full doing column shows the WIP error', async ({ page }) => {
  for (const title of ['A', 'B', 'C', 'D']) await addCard(page, title);
  await advance(page, 'todo', 'A');
  await advance(page, 'doing', 'A'); // A: done
  for (const title of ['B', 'C', 'D']) await advance(page, 'todo', title); // Doing is full
  await cardIn(page, 'done', 'A').getByTestId('move-back').click();
  await expect(page.getByTestId('error-message')).toBeVisible();
  await expect(column(page, 'doing').getByTestId('card')).toHaveCount(3);
  await expect(cardIn(page, 'done', 'A')).toHaveCount(1);
});

test('10 an empty or whitespace-only title does not create a card', async ({ page }) => {
  await addCard(page, '');
  await addCard(page, '   ');
  await expect(page.getByTestId('card')).toHaveCount(0);
  await addCard(page, 'Real'); // the app keeps working afterwards
  await expect(page.getByTestId('card')).toHaveCount(1);
  await expect(cardIn(page, 'todo', 'Real')).toHaveCount(1);
});

// --- priority, search, rename, undo/redo, migration ---------------------------------------

const addWithPriority = async (page: Page, title: string, priority: 'low' | 'medium' | 'high') => {
  await page.getByTestId('priority-select').selectOption(priority);
  await addCard(page, title);
};
const titlesIn = (page: Page, name: 'todo' | 'doing' | 'done') =>
  column(page, name).getByTestId('card').evaluateAll((cards) => cards.map((card) => card.textContent ?? ''));

test('11 the priority of a new card comes from the priority select (default medium)', async ({ page }) => {
  await addCard(page, 'Plain');
  await addWithPriority(page, 'Urgent', 'high');
  await expect(cardIn(page, 'todo', 'Plain').getByTestId('card-priority')).toHaveValue('medium');
  await expect(cardIn(page, 'todo', 'Urgent').getByTestId('card-priority')).toHaveValue('high');
});

test('12 cards are ordered by priority inside a column', async ({ page }) => {
  await addWithPriority(page, 'Alpha', 'low');
  await addWithPriority(page, 'Bravo', 'high');
  await addWithPriority(page, 'Charlie', 'medium');
  await addWithPriority(page, 'Delta', 'high');
  const order = (await titlesIn(page, 'todo')).map((text) => ['Alpha', 'Bravo', 'Charlie', 'Delta'].find((t) => text.includes(t)));
  expect(order).toEqual(['Bravo', 'Delta', 'Charlie', 'Alpha']);
});

test('13 a second high-priority card cannot enter Doing and the error clears afterwards', async ({ page }) => {
  await addWithPriority(page, 'H1', 'high');
  await addWithPriority(page, 'H2', 'high');
  await addWithPriority(page, 'M1', 'medium');
  await advance(page, 'todo', 'H1');
  await advance(page, 'todo', 'H2');
  await expect(page.getByTestId('error-message')).toBeVisible();
  await expect(cardIn(page, 'todo', 'H2')).toHaveCount(1);
  await expect(column(page, 'doing').getByTestId('card')).toHaveCount(1);
  await advance(page, 'todo', 'M1'); // a successful action clears the message
  await expect(page.getByTestId('error-message')).toHaveCount(0);
  await expect(cardIn(page, 'doing', 'M1')).toHaveCount(1);
});

test('14 search filters the cards of all columns, counts show every card', async ({ page }) => {
  for (const title of ['Buy milk', 'Write report', 'Milkshake']) await addCard(page, title);
  await advance(page, 'todo', 'Write report');
  await page.getByTestId('search-input').fill('  MILK ');
  await expect(page.getByTestId('card')).toHaveCount(2);
  await expect(cardIn(page, 'todo', 'Buy milk')).toHaveCount(1);
  await expect(column(page, 'doing').getByTestId('card')).toHaveCount(0);
  await expect(page.getByTestId('count-todo')).toHaveText('2');
  await expect(page.getByTestId('count-doing')).toHaveText('1');
  await expect(page.getByTestId('count-done')).toHaveText('0');
  await page.getByTestId('search-input').fill('');
  await expect(page.getByTestId('card')).toHaveCount(3);
});

test('15 a card can be renamed, an empty name is rejected, the new name persists', async ({ page }) => {
  await addCard(page, 'Old');
  await firstCard(page).getByTestId('edit-card').click();
  await expect(firstCard(page).getByTestId('edit-input')).toHaveValue('Old');
  await firstCard(page).getByTestId('edit-input').fill('   ');
  await firstCard(page).getByTestId('save-edit').click();
  await expect(page.getByTestId('error-message')).toBeVisible();
  await expect(firstCard(page).getByTestId('edit-input')).toBeVisible(); // editor stays open
  await firstCard(page).getByTestId('edit-input').fill('  New  ');
  await firstCard(page).getByTestId('save-edit').click();
  await expect(page.getByTestId('error-message')).toHaveCount(0);
  await expect(page.getByTestId('card')).toHaveCount(1);
  await expect(firstCard(page)).toContainText('New');
  await expect(firstCard(page)).not.toContainText('Old');
  await page.reload();
  await expect(firstCard(page)).toContainText('New');
});

test('16 undo and redo revert and replay changes, history is not persisted', async ({ page }) => {
  const undoButton = page.getByTestId('undo-button');
  const redoButton = page.getByTestId('redo-button');
  await expect(undoButton).toBeDisabled();
  await expect(redoButton).toBeDisabled();
  await addCard(page, 'Step');
  await advance(page, 'todo', 'Step');
  await expect(undoButton).toBeEnabled();
  await undoButton.click();
  await expect(cardIn(page, 'todo', 'Step')).toHaveCount(1);
  await expect(redoButton).toBeEnabled();
  await redoButton.click();
  await expect(cardIn(page, 'doing', 'Step')).toHaveCount(1);
  await expect(redoButton).toBeDisabled();
  await undoButton.click();
  await undoButton.click(); // also undoes the add
  await expect(page.getByTestId('card')).toHaveCount(0);
  await expect(undoButton).toBeDisabled();
  await redoButton.click();
  await expect(cardIn(page, 'todo', 'Step')).toHaveCount(1);
  await page.reload();
  await expect(cardIn(page, 'todo', 'Step')).toHaveCount(1); // the board is persisted ...
  await expect(undoButton).toBeDisabled(); // ... the history is not
  await expect(redoButton).toBeDisabled();
});

test('17 rejected actions create no history entry, undo also covers delete and priority', async ({ page }) => {
  for (const title of ['T-A', 'T-B', 'T-C', 'T-D']) await addCard(page, title);
  for (const title of ['T-A', 'T-B', 'T-C', 'T-D']) await advance(page, 'todo', title); // the 4th is rejected
  await expect(page.getByTestId('error-message')).toBeVisible();
  const undoButton = page.getByTestId('undo-button');
  await undoButton.click(); // reverts the 3rd successful move (C), not the rejected one
  await expect(cardIn(page, 'todo', 'T-C')).toHaveCount(1);
  await expect(cardIn(page, 'todo', 'T-D')).toHaveCount(1);
  await cardIn(page, 'todo', 'T-D').getByTestId('delete-card').click();
  await expect(page.getByTestId('card').filter({ hasText: 'T-D' })).toHaveCount(0);
  await undoButton.click();
  await expect(cardIn(page, 'todo', 'T-D')).toHaveCount(1);
  await cardIn(page, 'todo', 'T-D').getByTestId('card-priority').selectOption('high');
  await undoButton.click();
  await expect(cardIn(page, 'todo', 'T-D').getByTestId('card-priority')).toHaveValue('medium');
});

test('18 data of the previous version loads with medium priority', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('kanban-board', JSON.stringify({
      cards: [
        { id: 'a', title: 'Legacy todo', column: 'todo' },
        { id: 'b', title: 'Legacy doing', column: 'doing' },
      ],
    }));
  });
  await page.reload();
  await expect(cardIn(page, 'todo', 'Legacy todo').getByTestId('card-priority')).toHaveValue('medium');
  await expect(cardIn(page, 'doing', 'Legacy doing')).toHaveCount(1);
  await addCard(page, 'New one'); // the app keeps working and saves in the new format
  await page.reload();
  await expect(page.getByTestId('card')).toHaveCount(3);
});

test('19 raising a second card in Doing to high priority is rejected', async ({ page }) => {
  await addWithPriority(page, 'Hot', 'high');
  await addWithPriority(page, 'Mild', 'medium');
  await advance(page, 'todo', 'Hot');
  await advance(page, 'todo', 'Mild');
  await cardIn(page, 'doing', 'Mild').getByTestId('card-priority').selectOption('high');
  await expect(page.getByTestId('error-message')).toBeVisible();
  await expect(cardIn(page, 'doing', 'Mild').getByTestId('card-priority')).toHaveValue('medium');
  await cardIn(page, 'doing', 'Hot').getByTestId('card-priority').selectOption('low');
  await cardIn(page, 'doing', 'Mild').getByTestId('card-priority').selectOption('high');
  await expect(cardIn(page, 'doing', 'Mild').getByTestId('card-priority')).toHaveValue('high');
  expect((await titlesIn(page, 'doing'))[0]).toContain('Mild'); // high first
});
