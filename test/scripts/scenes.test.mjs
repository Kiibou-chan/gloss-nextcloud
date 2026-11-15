import { expect, test, vi } from 'vitest';

// Keep the scene executable without a browser or server, with assertions on synthetic DOM rows.
vi.mock('@playwright/test', () => {
  const check = locator => ({
    toBeVisible: async () => expect(locator.elements.length).toBeGreaterThan(0),
    toHaveAttribute: async (key, value) => expect(locator.elements[0].getAttribute(key)).toBe(value),
    toHaveText: async text => expect(locator.elements[0].textContent).toBe(text),
    toHaveCount: async total => expect(locator.elements).toHaveLength(total),
  });
  check.poll = callback => ({ toBe: async value => expect(await callback()).toBe(value) });
  return { expect: check };
});

import { scenes } from '../../scripts/shots/scenes.mjs';

function locator(elements, clicked) {
  return {
    elements,
    count: async () => elements.length,
    fill: async () => {},
    press: async () => {},
    dispatchEvent: async () => {},
    click: async () => { if (clicked) clicked.push(...elements.map(element => element.textContent)); },
    first: () => locator(elements.slice(0, 1), clicked),
    filter: ({ hasText, has }) => locator(elements.filter(element => has
      ? has.elements.some(match => element === match || element.contains(match))
      : typeof hasText === 'string' ? element.textContent.includes(hasText) : hasText.test(element.textContent)), clicked),
  };
}

function element(text = '') {
  const node = document.createElement('div');
  node.textContent = text;
  node.setAttribute('contenteditable', 'true');
  return node;
}

test.each(['1111111111111111', '2222222222222222'])(
  'H6 opens only the current review when two Ada files exist: %s', async id => {
    const key = `ada-${id}`;
    const clicked = [];
    const rows = ['ada-1111111111111111.json', 'ada-2222222222222222.json'].map(filename => {
      const row = element();
      row.append(element(filename));
      return row;
    });
    const ownerPage = {
      goto: async () => {},
      waitForURL: async () => {},
      locator: selector => locator(selector === '[data-cy-files-list-row-name]' ? rows : [element()], clicked),
      getByRole: () => locator([element()]),
      getByText: (text, options) => locator(text === 'Details' ? [element(text)]
        : rows.flatMap(row => [...row.children]).filter(node => options?.exact
          ? node.textContent === text : node.textContent.includes(text))),
    };
    let routeHandler;
    let aborted = false;
    let continued = false;
    let captures = 0;
    let closed = false;
    const page = {
      locator: selector => locator([element()]),
      getByRole: role => locator([element(role === 'status' ? 'Not saved yet; trying again in 2 s' : '')]),
      route: async (_pattern, handler) => { routeHandler = handler; },
      evaluate: async () => 'grow',
      keyboard: {
        press: async () => {},
        insertText: async () => {
          const request = { method: () => 'POST', postData: () => new URLSearchParams({ reviewer: key }).toString() };
          await routeHandler({
            request: () => request,
            fetch: async () => ({ ok: () => true }),
            abort: async () => { aborted = true; },
          });
        },
      },
    };
    await scenes.waiting.run({
      page,
      browser: { newContext: async () => ({ newPage: async () => ownerPage, close: async () => { closed = true; } }) },
      options: {},
      state: { base: 'http://synthetic.invalid', owner: 'synthetic-owner', password: '' },
      capture: async suffix => {
        captures++;
        if (suffix === '-retry') {
          await routeHandler({ request: () => ({ method: () => 'POST' }), continue: async () => { continued = true; } });
          page.getByRole = role => locator([element(role === 'status' ? 'Saved' : '')]);
        }
      },
    });
    expect(clicked).toEqual([`${key}.json`]);
    expect({ aborted, continued, captures, closed }).toEqual({ aborted: true, continued: true, captures: 2, closed: true });
  },
);
