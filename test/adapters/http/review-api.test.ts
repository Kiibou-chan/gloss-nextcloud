import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReviewSession } from '../../../src/app/session'
import { fakes } from '../../app/fakes'
import { createReviewApi } from '../../../src/adapters/http/review-api'

const base = '/index.php/apps/gloss/r/synthetic'
const ended = 'Your session ended. Reload the page to continue; your changes are kept in this browser.'
const draft = { main: 'draft.typ', files: [{ file: 'draft.typ', text: 'Synthetic draft.', etag: 'etag' }] }
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

function setup() {
  const fetcher = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', fetcher)
  return { fetcher, api: createReviewApi(base, 'initial-token') }
}

describe('review HTTP adapter', () => {
  it('loads the draft with the request token', async () => {
    const { api, fetcher } = setup()
    fetcher.mockResolvedValueOnce(reply(draft))
    expect(await api.draft()).toEqual(draft)
    expect(fetcher).toHaveBeenCalledWith(base + '/draft', expect.objectContaining({ headers: { requesttoken: 'initial-token' } }))
  })
  it('opens the interim GET route and wraps the stored review at revision zero', async () => {
    const { api, fetcher } = setup()
    const review = { name: 'Synthetic Reviewer', items: [] }
    fetcher.mockResolvedValueOnce(reply(review))
    expect(await api.open('a+b')).toEqual({ review, revision: 0 })
    expect(fetcher).toHaveBeenCalledWith(base + '/review?reviewer=a%2Bb', expect.objectContaining({ headers: { requesttoken: 'initial-token' } }))
  })
  it('posts the exact review bytes and reviewer, ignoring baseRevision until F1b', async () => {
    const { api, fetcher } = setup()
    fetcher.mockResolvedValueOnce(reply({ saved: true }))
    expect(await api.save('key', '{ "sent": false }', 12)).toEqual({ revision: 0 })
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe(base + '/review')
    expect(init).toMatchObject({ method: 'POST', headers: { requesttoken: 'initial-token' } })
    expect(String(init?.body)).toBe(new URLSearchParams({ reviewer: 'key', review: '{ "sent": false }' }).toString())
  })
  for (const status of [400, 403, 404, 409, 410, 413, 423, 429, 500]) {
    it(`returns ${status} refusals unchanged without retrying`, async () => {
      const { api, fetcher } = setup()
      fetcher.mockImplementation(async () => reply({ error: 'synthetic-refusal' }, status))
      expect(await api.save('key', '{}', 0)).toEqual({ status, error: 'synthetic-refusal' })
      expect(await api.open('key')).toEqual({ status, error: 'synthetic-refusal' })
      expect(fetcher).toHaveBeenCalledTimes(2)
    })
  }
  it('returns network failures and rejects draft failures with status and message', async () => {
    const { api, fetcher } = setup()
    fetcher.mockRejectedValue(new TypeError('offline'))
    expect(await api.open('key')).toEqual({ status: 0, error: 'network' })
    expect(await api.save('key', '{}', 0)).toEqual({ status: 0, error: 'network' })
    await expect(api.draft()).rejects.toMatchObject({ status: 0, message: 'network' })
    fetcher.mockResolvedValue(reply({ error: 'missing' }, 404))
    await expect(api.draft()).rejects.toMatchObject({ status: 404, message: 'missing' })
  })
  it('preserves the HTTP status when an error response is not JSON', async () => {
    const { api, fetcher } = setup()
    fetcher.mockResolvedValue(new Response('Unavailable', { status: 503, statusText: 'Service Unavailable' }))
    expect(await api.open('key')).toEqual({ status: 503, error: 'Service Unavailable' })
  })
  for (const method of ['draft', 'open', 'save'] as const) {
    const call = (api: ReturnType<typeof createReviewApi>) => method === 'draft' ? api.draft() : method === 'open' ? api.open('key') : api.save('key', '{ "items": [] }', 7)
    it(`refreshes via the public endpoint and repeats ${method} once with identical bytes`, async () => {
      const { api, fetcher } = setup()
      fetcher.mockResolvedValueOnce(reply({}, 412)).mockResolvedValueOnce(reply({ token: 'fresh-token' })).mockResolvedValueOnce(reply(method === 'draft' ? draft : { saved: true }))
      await call(api)
      expect(fetcher).toHaveBeenCalledTimes(3)
      expect(fetcher.mock.calls[1]?.[0]).toBe('/index.php/csrftoken')
      expect(fetcher.mock.calls[1]?.[1]?.method ?? 'GET').toBe('GET')
      const first = fetcher.mock.calls[0]!
      const retried = fetcher.mock.calls[2]!
      expect(retried[0]).toBe(first[0])
      expect(String(retried[1]?.body)).toBe(String(first[1]?.body))
      expect(retried[1]?.method).toBe(first[1]?.method)
      expect(retried[1]?.headers).toEqual({ requesttoken: 'fresh-token' })
      fetcher.mockResolvedValueOnce(reply(draft))
      await api.draft()
      expect(fetcher.mock.calls[3]?.[1]?.headers).toEqual({ requesttoken: 'fresh-token' })
    })
    it(`stops on the second 412 for ${method}`, async () => {
      const { api, fetcher } = setup()
      fetcher.mockResolvedValueOnce(reply({}, 412)).mockResolvedValueOnce(reply({ token: 'fresh-token' })).mockResolvedValueOnce(reply({}, 412))
      if (method === 'draft') await expect(call(api)).rejects.toMatchObject({ status: 412, message: ended })
      else expect(await call(api)).toEqual({ status: 412, error: ended })
      expect(fetcher).toHaveBeenCalledTimes(3)
    })
  }
  it('does not retry a failed token refresh', async () => {
    const { api, fetcher } = setup()
    fetcher.mockResolvedValueOnce(reply({}, 412)).mockResolvedValueOnce(reply({}, 412))
    expect(await api.save('key', '{}', 0)).toEqual({ status: 412, error: ended })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})


describe('save request lifetime', () => {
  it('passes keepalive and propagates the caller abort signal to fetch', async () => {
    const { api, fetcher } = setup(); const controller = new AbortController()
    fetcher.mockImplementation(() => new Promise(() => {}))
    const saving = api.save('key', '{}', 0, { keepalive: true, signal: controller.signal })
    expect(fetcher.mock.calls[0]![1]?.keepalive).toBe(true)
    const signal = fetcher.mock.calls[0]![1]?.signal
    expect(signal?.aborted).toBe(false); controller.abort()
    expect(signal?.aborted).toBe(true)
    expect(await saving).toEqual({ status: 0, error: 'network' })
  })
  it('times out a hung save after 30 seconds as a network failure', async () => {
    vi.useFakeTimers(); const { api, fetcher } = setup()
    fetcher.mockImplementation(() => new Promise(() => {}))
    let result: unknown; const saving = api.save('key', '{}', 0).then(value => { result = value })
    await vi.advanceTimersByTimeAsync(29_999); expect(result).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    expect(result).toEqual({ status: 0, error: 'network' })
    expect(fetcher.mock.calls[0]![1]?.signal?.aborted).toBe(true)
    await saving; expect(vi.getTimerCount()).toBe(0)
  })
  it('clears pending and resolves Send after hung saves time out', async () => {
    vi.useFakeTimers(); const { api, fetcher } = setup(); const f = fakes()
    fetcher.mockImplementation(() => new Promise(() => {}))
    const session = new ReviewSession({ ...f.ports, api: { ...f.api, save: api.save } })
    await session.start(); await session.setName('Ada')
    f.editor.replace({ from: 6, to: 10, insert: 'blue' }); await f.advance(600)
    let resolved = false; const sending = session.send().then(() => { resolved = true })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(resolved).toBe(true); expect(f.head()).toMatchObject({ editable: true, status: 'Not sent: network' })
    await sending
    fetcher.mockResolvedValue(reply({ saved: true })); await session.send()
    expect(f.head().status).toBe('Review sent. Thank you.'); session.dispose()
  })
})
