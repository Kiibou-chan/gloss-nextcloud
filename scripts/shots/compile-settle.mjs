// The browser compile of a Typst draft, seen from a scene: its answers are counted, and a look is settled once the compiled PDF or a fallback line stands.
import { expect } from '@playwright/test';

export const COMPILING = 'Showing your PDF while the draft compiles.';

/** Records each compiler worker answer on `window.__compiles`, before the page's own scripts run; a navigation after this call starts the record. */
export async function watchCompiles(context) {
  await context.addInitScript(() => {
    const Original = window.Worker;
    window.__compiles = [];
    window.Worker = class extends Original {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', event => {
          if (event.data && typeof event.data.ms === 'number') window.__compiles.push({ ms: event.data.ms, pdf: !!event.data.pdf });
        });
      }
    };
  });
}

export const compiles = page => page.evaluate(() => window.__compiles.length);

/**
 * Waits until the draft's compile is over for the look now chosen, and says how: 'compiled' once an answer past `before` has landed and the quiet line is gone, 'fallback' once the quiet line names why the uploaded PDF stays.
 * The first state of a look has no line and no new answer, so neither counts as settled.
 */
export async function settled(page, before) {
  let state = null;
  await expect.poll(async () => {
    const [count, lines, canvas] = await Promise.all([compiles(page), page.locator('.gr-pdf-note-line').allTextContents(), page.locator('#gr-pdf canvas').count()]);
    const fallback = lines.find(line => line && line !== COMPILING);
    if (fallback) state = 'fallback';
    else if (count > before && !lines.length && canvas) state = 'compiled';
    else state = null;
    return state;
  }, { timeout: 120_000 }).not.toBeNull();
  // The session places marks 400 ms after a document swap.
  await page.waitForTimeout(700);
  return state;
}
