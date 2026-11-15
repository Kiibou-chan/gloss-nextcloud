import { AppliedMap } from './applied-map'
import type { Change, Proposal } from './model'

export type Region = { from: number; to: number }

/** Regions use the editor text before the transaction, as do its changes. */
export function regions(applied: string, changes: readonly Change[], proposals: readonly Proposal[] | AppliedMap): Region[] {
  const spans = (proposals instanceof AppliedMap ? proposals : new AppliedMap(proposals)).spans().map(e => ({ from: e.start, to: e.appliedEnd }))
  const out: Region[] = []
  for (const change of [...changes].sort((a, b) => a.from - b.from)) {
    const newline = applied.indexOf('\n', change.to)
    const region = { from: applied.lastIndexOf('\n', change.from - 1) + 1, to: newline < 0 ? applied.length : newline }
    if (change.from === 0) region.from = 0
    let lo = 0, hi = spans.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (spans[mid]!.to < region.from) lo = mid + 1
      else hi = mid
    }
    // A whitespace-only gap cannot separate word changes (B4).
    while (lo > 0 && /^\s*$/.test(applied.slice(spans[lo - 1]!.to, region.from))) {
      region.from = spans[--lo]!.from
    }
    for (let i = lo; i < spans.length; i++) {
      const span = spans[i]!
      if (span.from > region.to && !/^\s*$/.test(applied.slice(region.to, span.from))) break
      region.from = Math.min(region.from, span.from)
      region.to = Math.max(region.to, span.to)
    }
    const previous = out[out.length - 1]
    if (previous && region.from <= previous.to) {
      previous.from = Math.min(previous.from, region.from)
      previous.to = Math.max(previous.to, region.to)
    } else out.push(region)
  }
  return out
}
