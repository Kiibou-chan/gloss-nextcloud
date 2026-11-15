import { changes as diff } from '../text/diff'
import { quoteAt } from '../text/quote'
import { AppliedMap } from './applied-map'
import { regions } from './region'
import type { Region } from './region'
import type { Change, Comment, Item, NewId, Note, Proposal, Target } from './model'

type Edits = { changed: Set<string>; removed: Set<string> }

export class DraftReview {
  private current: (Proposal | Note)[]
  private text: string
  private map: AppliedMap

  constructor(private readonly file: string, private readonly draft: string, placed: readonly Item[] = []) {
    this.current = placed.filter(i => i.kind !== 'overall').filter(i => i.file === file).map(i => ({ ...i, quote: { ...i.quote }, comments: i.comments.map(c => ({ ...c })) }))
    // Join saved neighbours once at load, before a card can be shown (M3).
    const proposals: Proposal[] = []
    for (const p of this.proposals().sort((a, b) => a.from - b.from)) {
      const previous = proposals[proposals.length - 1]
      const end = previous ? previous.from + previous.quote.exact.length : 0
      if (previous && /^\s*$/.test(draft.slice(end, p.from))) {
        previous.proposal += draft.slice(end, p.from) + p.proposal
        previous.quote = quoteAt(draft, previous.from, p.from + p.quote.exact.length)
        const comments = [...previous.comments, ...p.comments]
        previous.comments = comments.length > 1
          ? [{ text: comments.map(c => c.text).join('\n'), at: comments[0]!.at }] : comments
      } else proposals.push(p)
    }
    this.current = [...proposals, ...this.current.filter(i => i.kind === 'comment')].sort((a, b) => a.from - b.from)
    this.map = new AppliedMap(proposals)
    let text = '', pos = 0
    for (const { item: p, end } of this.map.spans()) {
      text += draft.slice(pos, p.from) + p.proposal
      pos = end
    }
    this.text = text + draft.slice(pos)
  }

  private proposals(): Proposal[] { return this.current.filter(i => i.kind === 'proposal') }
  applied(): string { return this.text }
  items(): readonly Item[] { return this.current }
  toApplied(p: number): number { return this.map.toApplied(p) }
  fromApplied(q: number): { at: number } | { inside: string } { return this.map.fromApplied(q) }

  edit(changes: readonly Change[], newId: NewId, now: string): Edits {
    const ordered = [...changes].sort((a, b) => a.from - b.from)
    return this.replaceRegions(regions(this.text, ordered, this.map), ordered, newId, now)
  }

  /** N2: the reconciliation path is uncapped, preserving whole-draft identities. */
  rebuild(text: string, newId: NewId, now: string): Edits {
    return text === this.text ? { changed: new Set(), removed: new Set() }
      : this.replaceRegions([{ from: 0, to: this.text.length }], [{ from: 0, to: this.text.length, insert: text }], newId, now, true)
  }

  private replaceRegions(areas: readonly Region[], changes: readonly Change[], newId: NewId, now: string, wholeDraft = false): Edits {
    const changed = new Set<string>(), removed = new Set<string>()
    if (!areas.length) return { changed, removed }
    const spans = this.map.spans().map(e => ({ p: e.item, from: e.start, to: e.appliedEnd }))
    const proposals: Proposal[] = []
    const notes = this.current.filter(i => i.kind === 'comment')
    const chunks: string[] = []
    let editIndex = 0, itemIndex = 0, position = 0
    for (const area of areas) {
      chunks.push(this.text.slice(position, area.from))
      const local: string[] = []
      let cursor = area.from
      while (editIndex < changes.length && changes[editIndex]!.from <= area.to) {
        const c = changes[editIndex++]!
        local.push(this.text.slice(cursor, c.from), c.insert)
        cursor = c.to
      }
      local.push(this.text.slice(cursor, area.to))
      const text = local.join('')
      chunks.push(text)
      position = area.to
      while (itemIndex < spans.length && spans[itemIndex]!.to < area.from) proposals.push(spans[itemIndex++]!.p)
      const inside: Proposal[] = []
      while (itemIndex < spans.length && spans[itemIndex]!.from <= area.to) inside.push(spans[itemIndex++]!.p)
      const start = this.map.fromApplied(area.from), end = this.map.fromApplied(area.to)
      // Region ends are outside proposals, including zero-width deletions.
      const aFrom = Math.min('at' in start ? start.at : inside[0]!.from, ...inside.map(p => p.from))
      const aTo = Math.max('at' in end ? end.at : inside[inside.length - 1]!.from + inside[inside.length - 1]!.quote.exact.length,
        ...inside.map(p => p.from + p.quote.exact.length))
      const source = this.draft.slice(aFrom, aTo)
      let ranges = diff(source, text, wholeDraft ? { maxEdits: source.length + text.length } : {})
      if (ranges === 'tooMany') ranges = diff(source, text, { by: 'line' })
      if (ranges === 'tooMany') ranges = [{ aFrom: 0, aTo: source.length, bFrom: 0, bTo: text.length }]
      const taken = new Set<string>()
      for (const c of ranges) {
        const from = aFrom + c.aFrom, to = aFrom + c.aTo
        const was = inside.find(p => !taken.has(p.id) && p.from <= to && from <= p.from + p.quote.exact.length)
        if (was) taken.add(was.id)
        const p: Proposal = { kind: 'proposal', id: was?.id ?? newId(), file: this.file, from,
          quote: quoteAt(this.draft, from, to), proposal: text.slice(c.bFrom, c.bTo), comments: was?.comments ?? [], at: was?.at ?? now }
        if (!was || was.from !== p.from || was.quote.exact !== p.quote.exact || was.proposal !== p.proposal) changed.add(p.id)
        proposals.push(p)
      }
      for (const p of inside) if (!taken.has(p.id)) {
        if (p.comments.length) {
          const { proposal: _proposal, ...note } = p
          const from = Math.min(p.from, Math.max(0, this.draft.length - 1))
          notes.push({ ...note, kind: 'comment', from, quote: quoteAt(this.draft, from, Math.max(p.from + p.quote.exact.length, from + 1)) })
          changed.add(p.id)
        } else removed.add(p.id)
      }
    }
    while (itemIndex < spans.length) proposals.push(spans[itemIndex++]!.p)
    chunks.push(this.text.slice(position))
    this.current = [...proposals, ...notes].sort((a, b) => a.from - b.from)
    this.text = chunks.join('')
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
