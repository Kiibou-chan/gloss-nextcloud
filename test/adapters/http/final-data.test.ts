import { afterEach, expect, it, vi } from 'vitest'
import { createReviewApi } from '../../../src/adapters/http/review-api'
const base = '/nextcloud/index.php/apps/gloss/r/TOKEN'
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
it('I3 derives draft, open, save, and refresh URLs from a subpath web root', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({})); vi.stubGlobal('fetch', fetcher)
  const api = createReviewApi(base, 'synthetic'); await api.draft(); await api.open('key')
  fetcher.mockResolvedValueOnce(Response.json({}, { status: 412 })).mockResolvedValueOnce(Response.json({ token: 'new' }))
  await api.save('key', '{}', 0)
  expect(fetcher.mock.calls.map(c => c[0])).toEqual([base + '/draft', base + '/review/open', base + '/review', '/nextcloud/csrftoken', base + '/review'])
})
it.each(['404', 'network', 'invalid'])('I3 maps a failed refresh (%s) to the session-ended sentence', async mode => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 412 })); vi.stubGlobal('fetch', fetcher)
  if (mode === 'network') fetcher.mockRejectedValueOnce(new Error('offline'))
  else fetcher.mockResolvedValueOnce(mode === 'invalid' ? new Response('invalid') : Response.json({}, { status: 404 }))
  expect(await createReviewApi(base, '').save('key', '{}', 0)).toEqual({ status: 412, error: 'Your session ended. Reload the page to continue; your changes are kept in this browser.' })
})
it('M7 scales the save timeout with the encoded upload size', async () => {
  vi.useFakeTimers(); const fetcher = vi.fn().mockImplementation(() => new Promise(() => {})); vi.stubGlobal('fetch', fetcher)
  const body = 'ü'.repeat(20000), bytes = new TextEncoder().encode(new URLSearchParams({ key: 'key', review: body, baseRevision: '0' }).toString()).length
  const duration = 30000 + Math.floor(bytes / 20000) * 1000
  let result: unknown; const save = createReviewApi(base, '').save('key', body, 0).then(r => { result = r })
  await vi.advanceTimersByTimeAsync(duration - 1); expect(result).toBeUndefined()
  await vi.advanceTimersByTimeAsync(1); expect(result).toEqual({ status: 0, error: 'network' }); await save
})
it('C1 preserves the raw review text returned by open', async () => {
  const raw = '{ "items": [] }'; vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"review":' + raw + ',"revision":1}')))
  expect(await createReviewApi(base, '').open('key')).toMatchObject({ rawReview: raw })
})
it('C1 prefers the stored file bytes over the re-encoded review envelope', async () => {
  const raw = '{ "items" : [ ], "escaped":"\\u0061" }'
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ review: JSON.parse(raw), revision: 1, rawReview: raw })))
  expect(await createReviewApi(base, '').open('key')).toMatchObject({ rawReview: raw })
})
it('M-d pagehide skips an encoded oversized upload without attempting a request or scheduling a retry', async () => {
  const { fakes } = await import('../../app/fakes')
  const { ReviewSession } = await import('../../../src/app/session')
  const f = fakes(), api = createReviewApi(base, '')
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
  const s = new ReviewSession({ ...f.ports, api: { ...f.api, save: api.save } }); await s.start(); await s.setName('Ada')
  s.setOverall('ü'.repeat(12000)); s.pagehide()
  for (let n = 0; n < 30; n++) await Promise.resolve()
  expect(fetcher).not.toHaveBeenCalled(); expect(f.head().status).not.toContain('trying again'); expect(s.dirty).toBe(true); s.dispose()
})
