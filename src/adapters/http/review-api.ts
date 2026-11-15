import type { CancelSignal, Failure, ReviewApi } from '../../app/ports'

const sessionEnded: Failure = {
  status: 412,
  error: 'Your session ended. Reload the page to continue; your changes are kept in this browser.',
}

async function refusal(response: Response): Promise<Failure> {
  if (response.status === 412) return { ...sessionEnded }
  const body: unknown = await response.json().catch(() => null)
  return {
    status: response.status,
    error: body !== null && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error : response.statusText,
  }
}

export function createReviewApi(base: string, requestToken: string): ReviewApi {
  let token = requestToken
  const root = base.replace(/\/$/, '')
  async function request(path: string, init: Omit<RequestInit, 'signal'> & { signal?: CancelSignal } = {}): Promise<{ data: unknown } | Failure> {
    const controller = new AbortController()
    const abort = () => controller.abort()
    let rejectAbort!: (reason: Error) => void
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject })
    const fail = () => rejectAbort(new Error('Request aborted'))
    controller.signal.addEventListener('abort', fail, { once: true })
    init.signal?.addEventListener('abort', abort, { once: true })
    if (init.signal?.aborted) abort()
    const timeout = setTimeout(abort, 30_000)
    const perform = async () => {
      const send = () => fetch(root + path, { ...init, signal: controller.signal, headers: { requesttoken: token } })
      let response = await send()
      if (response.status === 412) {
        const refreshed = await fetch('/index.php/csrftoken', { method: 'GET', signal: controller.signal })
        if (!refreshed.ok) return await refusal(refreshed)
        const fresh: unknown = await refreshed.json()
        if (!fresh || typeof fresh !== 'object' || !('token' in fresh) || typeof fresh.token !== 'string') {
          return { ...sessionEnded }
        }
        token = fresh.token
        response = await send()
      }
      if (!response.ok) return await refusal(response)
      return { data: await response.json() }
    }
    try {
      return await Promise.race([perform(), aborted])
    } catch {
      return { status: 0, error: 'network' }
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
      return 'status' in result ? result : result.data as Awaited<ReturnType<ReviewApi['open']>>
    },
    async save(key, body, baseRevision, options = {}) {
      const result = await request('/review', {
        ...options,
        method: 'POST',
        body: new URLSearchParams({ key, review: body, baseRevision: String(baseRevision) }),
      })
      return 'status' in result ? result : result.data as { revision: number }
    },
  }
}
