import type { Failure, ReviewApi } from '../../app/ports'

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
  async function request(path: string, init: RequestInit = {}): Promise<{ data: unknown } | Failure> {
    try {
      const send = () => fetch(root + path, { ...init, headers: { requesttoken: token } })
      let response = await send()
      if (response.status === 412) {
        const refreshed = await fetch('/index.php/csrftoken', { method: 'GET' })
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
    } catch {
      return { status: 0, error: 'network' }
    }
  }
  return {
    async draft() {
      const result = await request('/draft')
      if ('status' in result) throw Object.assign(new Error(result.error), { status: result.status })
      return result.data as Awaited<ReturnType<ReviewApi['draft']>>
    },
    async open(key) {
      const result = await request('/review?' + new URLSearchParams({ reviewer: key }))
      return 'status' in result ? result : { review: result.data, revision: 0 }
    },
    async save(key, body, _baseRevision) {
      const result = await request('/review', {
        method: 'POST',
        body: new URLSearchParams({ reviewer: key, review: body }),
      })
      return 'status' in result ? result : { revision: 0 }
    },
  }
}
