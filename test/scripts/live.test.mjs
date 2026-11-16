import { expect, test } from 'vitest';
import { recoverStaleToken } from '../../scripts/shots/live.mjs';

const reply = (path, status, method = 'POST') => ({
  url: () => `http://synthetic.invalid${path}`,
  status: () => status,
  request: () => ({ method: () => method }),
});

test.each(['/csrftoken', '/index.php/csrftoken'])(
  'checks the generated %s refresh between the refused save and retry', async csrf => {
    let listener, handler;
    const headers = [];
    const page = {
      url: () => 'http://synthetic.invalid/apps/gloss/r/synthetic',
      locator: () => ({ getAttribute: async () => csrf }),
      on: (_type, callback) => { listener = callback; },
      off: (_type, callback) => { expect(callback).toBe(listener); listener = undefined; },
      route: async (_pattern, callback) => { handler = callback; },
      unroute: async (_pattern, callback) => { expect(callback).toBe(handler); handler = undefined; },
    };
    const request = async () => handler({
      request: () => ({ headers: () => ({ requesttoken: 'synthetic-current-token' }) }),
      continue: async options => { headers.push(options?.headers?.requesttoken ?? 'unchanged'); },
    });
    await recoverStaleToken(page, async () => {
      await request();
      listener(reply('/apps/gloss/r/synthetic/review', 412));
      listener(reply(csrf, 200, 'GET'));
      await request();
      listener(reply('/apps/gloss/r/synthetic/review', 200));
    });
    expect(headers).toEqual(['synthetic-stale-token', 'unchanged']);
    expect(listener).toBeUndefined();
    expect(handler).toBeUndefined();
  },
);

test.each([
  [reply('/review', 200)],
  [reply('/review', 412), reply('/index.php/csrftoken', 200, 'GET'), reply('/review', 200)],
  [reply('/review', 412), reply('/review', 200), reply('/csrftoken', 200, 'GET')],
])('rejects missing, wrong-route, or out-of-order refresh evidence %#', async replies => {
  let listener, handler;
  const page = {
    url: () => 'http://synthetic.invalid/apps/gloss/r/synthetic',
    locator: () => ({ getAttribute: async () => '/csrftoken' }),
    on: (_type, callback) => { listener = callback; },
    off: () => {}, route: async (_pattern, callback) => { handler = callback; }, unroute: async () => {},
  };
  await expect(recoverStaleToken(page, async () => {
    await handler({ request: () => ({ headers: () => ({}) }), continue: async () => {} });
    for (const response of replies) listener(response);
  })).rejects.toThrow();
});
