import type { Proposal } from './model'

type Entry = { item: Proposal; end: number; start: number; appliedEnd: number; delta: number }

function first<T>(values: readonly T[], predicate: (value: T) => boolean): number {
  let lo = 0, hi = values.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (predicate(values[mid]!)) hi = mid
    else lo = mid + 1
  }
  return lo
}

/** Sorted once, with cumulative length changes; each lookup is O(log P). */
export class AppliedMap {
  private readonly entries: Entry[]
  private readonly nonempty: Entry[]

  constructor(proposals: readonly Proposal[]) {
    let delta = 0
    const sorted = proposals.every((p, i) => i === 0 || proposals[i - 1]!.from <= p.from)
      ? proposals : [...proposals].sort((a, b) => a.from - b.from)
    this.entries = sorted.map(item => {
      const end = item.from + item.quote.exact.length
      const start = item.from + delta
      const appliedEnd = start + item.proposal.length
      delta += item.proposal.length - item.quote.exact.length
      return { item, end, start, appliedEnd, delta }
    })
    this.nonempty = this.entries.filter(e => e.item.proposal.length > 0)
  }

  spans(): readonly Readonly<Entry>[] { return this.entries }

  toApplied(p: number): number {
    const i = first(this.entries, e => e.end >= p)
    const e = this.entries[i]
    if (e && p >= e.item.from) return p < e.end || p === e.item.from ? e.start : e.appliedEnd
    return p + (this.entries[i - 1]?.delta ?? 0)
  }

  fromApplied(q: number): { at: number } | { inside: string } {
    const e = this.nonempty[first(this.nonempty, e => e.appliedEnd >= q)]
    if (e && q >= e.start) return q === e.start ? { at: e.item.from } : { inside: e.item.id }
    const i = first(this.entries, e => e.appliedEnd > q)
    return { at: q - (this.entries[i - 1]?.delta ?? 0) }
  }
}
