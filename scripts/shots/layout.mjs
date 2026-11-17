// The review screen keeps its place: no layout shift while loading, and the same header, body, and column geometry in every view.
import { expect } from '@playwright/test';

const views = [['Editor', 'editor'], ['PDF', 'pdf'], ['Both', 'both']];
const tolerance = 0.5;
export const loadShiftLimit = 0.05;

const geometry = page => page.evaluate(() => {
  const rect = selector => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null; };
  return { root: rect('#gloss-review'), head: rect('.gr-head'), body: rect('.gr-body'), side: rect('.gr-side'), scrollbar: document.documentElement.scrollHeight > innerHeight };
});

/** Fields of two geometries that differ by more than the tolerance, as `name.field: before -> after`. */
export function differences(before, after) {
  const found = [];
  for (const name of ['root', 'head', 'body']) {
    for (const field of ['top', 'left', 'width', 'height']) {
      if (name === 'head' && field === 'height') continue;
      if (Math.abs(before[name][field] - after[name][field]) > tolerance) found.push(`${name}.${field}: ${before[name][field]} -> ${after[name][field]}`);
    }
  }
  return found;
}

export function layoutScene({ ready, status }) {
  return {
    folder: 'Typst',
    navigate: false,
    run: async ({ page, context, state, capture }) => {
      await context.addInitScript(() => {
        window.__shift = 0; window.__shiftLog = [];
        try {
          new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) { window.__shift += entry.value; window.__shiftLog.push({ value: entry.value, at: Math.round(entry.startTime), nodes: entry.sources.map(source => (source.node?.id || source.node?.className || source.node?.nodeName) + ' ' + JSON.stringify(source.previousRect) + '>' + JSON.stringify(source.currentRect)) }); } }).observe({ type: 'layout-shift', buffered: true });
        } catch { window.__shift = null; }
      });
      await page.goto(state.links.Typst, { waitUntil: 'networkidle' });
      await expect(page.locator('#gr-text .cm-content')).toBeVisible();
      await page.waitForTimeout(1500);
      const shift = await page.evaluate(() => window.__shift);
      if (shift !== null) expect(shift, `layout shift while loading ${JSON.stringify(await page.evaluate(() => window.__shiftLog))}`).toBeLessThan(loadShiftLimit);
      const first = await geometry(page);
      const seen = [];
      for (const [label, view] of [...views, views[0]]) {
        await page.getByRole('button', { name: label, exact: true }).click();
        await expect(page.locator('#gloss-review')).toHaveAttribute('data-view', view);
        if (view !== 'editor') await expect(page.locator('#gr-pdf canvas').first()).toBeVisible();
        await page.waitForTimeout(300);
        const now = await geometry(page);
        seen.push(`${view}: ${JSON.stringify(differences(first, now))}`);
        expect(differences(first, now), `${view} geometry`).toEqual([]);
        await capture(`-${view}`);
      }
      await ready(page);
      await expect(status(page)).toBeVisible();
      expect(differences(first, await geometry(page)), 'geometry once the name is set').toEqual([]);
    },
  };
}
