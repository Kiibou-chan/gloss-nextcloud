import { changes as diff } from '../text/diff'
import { quoteAt } from '../text/quote'
import { AppliedMap } from './applied-map'
import type { Change, Comment, Item, NewId, Note, Proposal, Target } from './model'

type Edits = { changed: Set<string>; removed: Set<string> }

export class DraftReview {
  private current: (Proposal | Note)[]
  private text: string
  private map: AppliedMap

  constructor(private readonly file: string, private readonly draft: string, placed: readonly Item[] = []) {
    this.current = placed.filter(i => i.kind !== 'overall').filter(i => i.file === file).map(i => ({ ...i, quote: { ...i.quote }, comments: i.comments.map(c => ({ ...c })) }))
    const proposals = this.proposals().sort((a, b) => a.from - b.from)
    let text = '', pos = 0
    for (const p of proposals) {
      text += draft.slice(pos, p.from) + p.proposal
      pos = p.from + p.quote.exact.length
    }
    this.text = text + draft.slice(pos)
    this.map = new AppliedMap(proposals)
  }

  private proposals(): Proposal[] { return this.current.filter(i => i.kind === 'proposal') }
  applied(): string { return this.text }
  items(): readonly Item[] { return this.current }
  toApplied(p: number): number { return this.map.toApplied(p) }
  fromApplied(q: number): { at: number } | { inside: string } { return this.map.fromApplied(q) }

  edit(changes: readonly Change[], newId: NewId, now: string): Edits {
    let text = '', pos = 0
    for (const c of [...changes].sort((a, b) => a.from - b.from)) {
      text += this.text.slice(pos, c.from) + c.insert
      pos = c.to
    }
    return this.rebuild(text + this.text.slice(pos), newId, now)
  }

  /** Whole-draft path deliberately has no edit cap (N2); S4b supplies the region path. */
  rebuild(text: string, newId: NewId, now: string): Edits {
    const changed = new Set<string>(), removed = new Set<string>()
    if (text === this.text) return { changed, removed }
    const old = this.proposals()
    const ranges = diff(this.draft, text, { maxEdits: this.draft.length + text.length })
    if (ranges === 'tooMany') throw new Error('Whole-draft diff exhausted its sufficient bound')
    const taken = new Set<string>()
    const proposals = ranges.map(c => {
      const was = old.find(p => !taken.has(p.id) && p.from <= c.aTo && c.aFrom <= p.from + p.quote.exact.length)
      if (was) taken.add(was.id)
      const p: Proposal = { kind: 'proposal', id: was?.id ?? newId(), file: this.file, from: c.aFrom, quote: quoteAt(this.draft, c.aFrom, c.aTo), proposal: text.slice(c.bFrom, c.bTo), comments: was?.comments ?? [], at: was?.at ?? now }
      if (!was || was.from !== p.from || was.quote.exact !== p.quote.exact || was.proposal !== p.proposal) changed.add(p.id)
      return p
    })
    const notes = this.current.filter(i => i.kind !== 'proposal')
    for (const p of old) if (!taken.has(p.id)) {
      if (p.comments.length) {
        const { proposal: _proposal, ...note } = p
        notes.push({ ...note, kind: 'comment' })
        changed.add(p.id)
      } else removed.add(p.id)
    }
    this.current = [...proposals, ...notes].sort((a, b) => a.from - b.from)
    this.text = text
    this.map = new AppliedMap(proposals)
    return { changed, removed }
  }

  targetFor(from: number, to: number): Target {
    const p = this.proposals().find(p => p.from < Math.max(to, from + 1) && Math.max(p.from + p.quote.exact.length, p.from + 1) > from)
    return p ? { id: p.id } : { from, to }
  }

  comment(target: Target, text: string, id: string, now: string): void {
    text = text.trim()
    if (!text) return
    const comment: Comment = { text, at: now }
    if ('id' in target) {
      const item = this.current.find(i => i.id === target.id)
      if (item) item.comments.push(comment)
    } else {
      this.current.push({ kind: 'comment', id, file: this.file, from: target.from, quote: quoteAt(this.draft, target.from, target.to), comments: [comment], at: now })
      this.current.sort((a, b) => a.from - b.from)
    }
  }

  deleteComment(itemId: string, index: number): void {
    const item = this.current.find(i => i.id === itemId)
    if (!item || index < 0 || index >= item.comments.length) return
    item.comments.splice(index, 1)
    if (item.kind === 'comment' && !item.comments.length) this.current = this.current.filter(i => i.id !== itemId)
  }

  undoChange(id: string): Change {
    const item = this.proposals().find(p => p.id === id)
    if (!item) throw new Error('Unknown proposal')
    const from = this.toApplied(item.from)
    return { from, to: from + item.proposal.length, insert: item.quote.exact }
  }
}
