import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReviewSession } from '../../../src/app/session'
import { fakes } from '../../app/fakes'
import { mountHead, mountPanel } from '../../../src/ui/mount'
import { createPanelModel } from '../../../src/ui/panel-model'
import { createReviewApi } from '../../../src/adapters/http/review-api'

const base = '/index.php/apps/gloss/r/synthetic'
const ended = 'Your session ended. Reload the page to continue; your changes are kept in this browser.'
const draft = { main: 'draft.typ', files: [{ file: 'draft.typ', text: 'Synthetic draft.', etag: 'etag' }] }
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

function setup() {
  const fetcher = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', fetcher)
  return { fetcher, api: createReviewApi(base, 'initial-token', '/cloud/index.php/csrftoken') }
}

describe('review HTTP adapter', () => {
  it('loads the draft with the request token', async () => {
    const { api, fetcher } = setup()
    fetcher.mockResolvedValueOnce(reply(draft))
    expect(await api.draft()).toEqual(draft)
    expect(fetcher).toHaveBeenCalledWith(base + '/draft', expect.objectContaining({ headers: { requesttoken: 'initial-token' } }))
  })
  it('opens through POST with the key in the body and preserves the server revision', async () => {
    const { api, fetcher } = setup()
    const review = { name: 'Synthetic Reviewer', items: [] }
    fetcher.mockResolvedValueOnce(reply({ review, revision: 7 }))
    expect(await api.open('a+b')).toEqual({ review, revision: 7, rawReview: JSON.stringify(review) })
    expect(fetcher).toHaveBeenCalledWith(base + '/review/open', expect.objectContaining({ method: 'POST', body: new URLSearchParams({ key: 'a+b' }), headers: { requesttoken: 'initial-token' } }))
  })
  it('posts the exact review bytes, key, and baseRevision', async () => {
    const { api, fetcher } = setup()
    fetcher.mockResolvedValueOnce(reply({ revision: 13 }))
    expect(await api.save('key', '{ "sent": false }', 12)).toEqual({ revision: 13 })
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe(base + '/review')
    expect(init).toMatchObject({ method: 'POST', headers: { requesttoken: 'initial-token' } })
    expect(String(init?.body)).toBe(new URLSearchParams({ key: 'key', review: '{ "sent": false }', baseRevision: '12' }).toString())
  })
  it('preserves an unknown key as an empty review', async () => {
    const { api, fetcher } = setup(); fetcher.mockResolvedValueOnce(reply({ review: null }))
    expect(await api.open('Abcdef1234567890')).toEqual({ review: null })
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
      expect(fetcher.mock.calls[1]?.[0]).toBe('/cloud/index.php/csrftoken')
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
  it('I3 ends the session without retrying when a save times out during token refresh', async () => {
    vi.useFakeTimers(); const { api, fetcher } = setup(); const f = fakes()
    fetcher.mockResolvedValueOnce(reply({}, 412)).mockImplementation(() => new Promise(() => {}))
    const session = new ReviewSession({ ...f.ports, api: { ...f.api, save: api.save } })
    try {
      await session.start(); await session.setName('Ada')
      session.setOverall('A synthetic overall comment'); await f.advance(5000)
      await vi.advanceTimersByTimeAsync(0)
      expect(fetcher).toHaveBeenCalledTimes(2)
      expect(fetcher.mock.calls[1]![0]).toBe('/cloud/index.php/csrftoken')
      await vi.advanceTimersByTimeAsync(30_000)
      expect(f.head().status).toBe(ended)
      expect(fetcher.mock.calls[1]![1]?.signal?.aborted).toBe(true)
      await f.advance(60_000)
      expect(fetcher).toHaveBeenCalledTimes(2)
      expect(vi.getTimerCount()).toBe(0)
    } finally { session.dispose() }
  })
  it('clears pending and resolves Send after hung saves time out', async () => {
    vi.useFakeTimers(); const { api, fetcher } = setup(); const f = fakes()
    fetcher.mockImplementation(() => new Promise(() => {}))
    const session = new ReviewSession({ ...f.ports, api: { ...f.api, save: api.save } })
    await session.start(); await session.setName('Ada')
    f.editor.replace({ from: 6, to: 10, insert: 'blue' }); await f.advance(600)
    let resolved = false; const sending = session.send().then(() => { resolved = true })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(resolved).toBe(true); expect(f.head()).toMatchObject({ editable: false, status: 'Not sent yet; trying again in 2 s' })
    await sending
    const body = f.store.read(f.store.rememberedKey()!)!.pending!.body
    fetcher.mockResolvedValue(reply({ revision: 1 })); session.online(); await f.advance(0)
    for (let i = 0; i < 30; i++) await Promise.resolve()
    expect(new URLSearchParams(fetcher.mock.lastCall![1]?.body as URLSearchParams).get('review')).toBe(body)
    expect(f.head().status).toBe('Review sent. Thank you.'); session.dispose()
  })
})


it('renders an unreviewable page without a name field or Send', async () => {
  const f = fakes(); const model = createPanelModel()
  const session = new ReviewSession({ ...f.ports, panel: model, reviewable: false })
  const header = document.createElement('header'), panel = document.createElement('aside')
  const unmountHead = mountHead(header, model, session), unmountPanel = mountPanel(panel, model, session)
  try {
    await session.start()
    expect(header.querySelector('input')).toBeNull(); expect(header.querySelector('#gr-send')).toBeNull()
    expect(header.textContent + panel.textContent).toContain('This link is not set up for reviewing.')
    expect(f.editor.setEditable).toHaveBeenLastCalledWith(false)
  } finally { session.dispose(); unmountHead(); unmountPanel() }
})

for (const protectedLink of [false, true]) {
  it(`classifies a refreshed 404 for a password-protected=${protectedLink} link and stops`, async () => {
    vi.useFakeTimers()
    const { fetcher } = setup()
    const api = createReviewApi(base, 'initial-token', '', protectedLink)
    const f = fakes()
    fetcher.mockResolvedValueOnce(reply({}, 412)).mockResolvedValueOnce(reply({ token: 'fresh-token' })).mockResolvedValueOnce(reply({}, 404))
    const session = new ReviewSession({ ...f.ports, api: { ...f.api, save: api.save } })
    try {
      await session.start(); await session.setName('Ada')
      session.setOverall('Synthetic lapse comment'); await f.advance(5000)
      for (let i = 0; i < 30; i++) await Promise.resolve()
      expect(f.head().status).toBe(protectedLink ? ended : 'This review link no longer works. Your changes are kept in this browser.')
      await f.advance(60_000)
      expect(fetcher).toHaveBeenCalledTimes(3)
    } finally { session.dispose() }
  })
}
