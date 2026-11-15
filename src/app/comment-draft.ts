import type { Clock, Ports } from './ports'
import type { HeadView } from './view'
import type { DraftReview } from '../domain/review/draft-review'
import type { Target } from '../domain/review/model'
import { quoteAt, refind, type Quote } from '../domain/text/quote'

type DraftContext = {
  record: { sent: boolean } | null; loading: boolean; key: string; ports: Ports
  file: string; draft: string; review: DraftReview | null; form: HeadView['form']; status: string
}
type Draft = { file: string; target: Target; quote: Quote; text: string; at: string }
export const RESELECT_COMMENT = 'Select the passage again to add this comment.'
function read(raw: string | null): Draft | null {
  try {
    const d = JSON.parse(raw ?? 'null')
    if (!d || typeof d.file !== 'string' || typeof d.text !== 'string' || typeof d.at !== 'string') return null
    if (!d.quote || !['exact', 'prefix', 'suffix'].every(k => typeof d.quote[k] === 'string')) return null
    const t = d.target
    if (!t || !(typeof t.id === 'string' || (Number.isInteger(t.from) && Number.isInteger(t.to) && t.from >= 0 && t.to >= t.from))) return null
    return d
  } catch { return null }
}

/** A private, tab-local form draft, separate from every saved review body. */
export class CommentDraft {
  private draft: Draft | null = null
  private restored = ''
  constructor(private readonly s: DraftContext, private readonly clock: Clock) {}
  restore(): void {
    const s = this.s
    if (!s.record || s.loading || !s.key || this.restored === s.key) return
    this.restored = s.key
    if (s.record.sent) { this.clear(); return }
    const d = read(s.ports.draftStore.read(s.key))
    if (!d) return
    this.draft = d
    let target: Target = d.target, detached = d.file !== s.file
    if ('id' in target) { const id = target.id; detached ||= !s.review?.items().some(item => item.id === id) }
    else {
      const range = refind(s.draft, d.quote, target.from)
      detached ||= range.detached
      if (!detached) target = { from: range.start, to: range.end }
    }
    s.form = { target, quote: d.quote.exact.replace(/\s+/g, ' ').trim(), focus: false, ...(detached ? { detached: true } : {}) }
    s.ports.panel.setCommentDraft?.(d.text)
    if (detached) s.status = RESELECT_COMMENT
  }
  update(text: string): void {
    const s = this.s, form = s.form
    if (!s.key || !form) return
    if (form.detached && this.draft) this.draft = { ...this.draft, text, at: this.clock.now() }
    else {
      const target = form.target
      const item = 'id' in target ? s.review?.items().find(item => item.id === target.id) : null
      const quote = item && item.kind !== 'overall' ? item.quote : 'from' in target ? quoteAt(s.draft, target.from, target.to) : null
      if (!quote) return
      this.draft = { file: s.file, target, quote, text, at: this.clock.now() }
    }
    s.ports.draftStore.write(s.key, JSON.stringify(this.draft))
  }
  retarget(): void { if (this.draft) this.update(this.draft.text) }
  clear(): void {
    this.draft = null
    if (this.s.key) this.s.ports.draftStore.clear(this.s.key)
    this.s.ports.panel.clearCommentDraft?.()
  }
}
