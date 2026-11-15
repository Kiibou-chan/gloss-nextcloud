import type { CommentDraftStore } from '../../app/ports'

export function createCommentDraftStore(token: string): CommentDraftStore {
  const name = (key: string) => `gloss-comment-draft:${token}:${key}`
  return {
    read(key) { try { return sessionStorage.getItem(name(key)) } catch { return null } },
    write(key, value) { try { sessionStorage.setItem(name(key), value) } catch { /* Storage may be unavailable. */ } },
    clear(key) { try { sessionStorage.removeItem(name(key)) } catch { /* Storage may be unavailable. */ } },
  }
}
