import { utf8Length, reviewUploadLength } from '../../domain/text/utf8'
import { SESSION_ENDED } from '../../app/messages'
import { rawValues } from '../../domain/format/raw-json'
import type { CancelSignal, Failure, ReviewApi } from '../../app/ports'

const sessionEnded: Failure = { status: 412, error: SESSION_ENDED }

async function refusal(response: Response): Promise<Failure> {
  if (response.status === 412) return { ...sessionEnded }
  const body: unknown = await response.json().catch(() => null)
  return {
    status: response.status,
    error: body !== null && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error : response.statusText,
  }
}

export function createReviewApi(base: string, requestToken: string, csrfTokenUrl = '', passwordProtected = false): ReviewApi {
  let token = requestToken
  const root = base.replace(/\/$/, '')
  async function request(path: string, init: Omit<RequestInit, 'signal'> & { signal?: CancelSignal } = {}): Promise<{ data: unknown; raw: string } | Failure> {
    const controller = new AbortController()
    const abort = () => controller.abort()
    let rejectAbort!: (reason: Error) => void
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject })
    const fail = () => rejectAbort(new Error('Request aborted'))
    controller.signal.addEventListener('abort', fail, { once: true })
    init.signal?.addEventListener('abort', abort, { once: true })
    if (init.signal?.aborted) abort()
    const timeout = setTimeout(abort, 30_000 + Math.floor(utf8Length(String(init.body ?? '')) / 20_000) * 1000)
    let refreshing = false
    const perform = async () => {
      const send = () => fetch(root + path, { ...init, signal: controller.signal, headers: { requesttoken: token } })
      let response = await send()
      if (response.status === 412) {
        refreshing = true
        let fresh: unknown
        try {
          const refreshed = await fetch(csrfTokenUrl, { method: 'GET', signal: controller.signal })
          if (!refreshed.ok) return { ...sessionEnded }
          fresh = await refreshed.json()
        } catch { return { ...sessionEnded } }
        if (!fresh || typeof fresh !== 'object' || !('token' in fresh) || typeof fresh.token !== 'string') {
          return { ...sessionEnded }
        }
        token = fresh.token
        refreshing = false
        response = await send()
        if (passwordProtected && response.status === 404) return { ...sessionEnded }
      }
      if (!response.ok) return await refusal(response)
      const raw = await response.text()
      return { data: JSON.parse(raw), raw }
    }
    try {
      return await Promise.race([perform(), aborted])
    } catch {
      return refreshing ? { ...sessionEnded } : { status: 0, error: 'network' }
    } finally {
      clearTimeout(timeout)
      init.signal?.removeEventListener('abort', abort)
      controller.signal.removeEventListener('abort', fail)
    }
  }
  return {
    async draft() {
      const result = await request('/draft')
      if ('status' in result) throw Object.assign(new Error(result.error), { status: result.status })
      return result.data as Awaited<ReturnType<ReviewApi['draft']>>
    },
    async open(key) {
      const result = await request('/review/open', { method: 'POST', body: new URLSearchParams({ key }) })
      if ('status' in result) return result
      const opened = result.data as Exclude<Awaited<ReturnType<ReviewApi['open']>>, Failure>
      return opened.review === null ? opened : { ...opened, rawReview: 'rawReview' in opened && typeof opened.rawReview === 'string' ? opened.rawReview : rawValues(result.raw).find(v => v.key === 'review')?.raw }
    },
    async save(key, body, baseRevision, options = {}) {
      const encoded = new URLSearchParams({ key, review: body, baseRevision: String(baseRevision) })
      if (options.keepalive && reviewUploadLength(key, body, baseRevision) >= 65_536) return { status: 0, error: 'network' }
      const result = await request('/review', {
        ...options,
        method: 'POST',
        body: encoded,
      })
      return 'status' in result ? result : result.data as { revision: number }
    },
  }
}
