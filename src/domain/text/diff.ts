type Token = { t: string; at: number }
export type DiffChange = { aFrom: number; aTo: number; bFrom: number; bTo: number }

export function tokens(s: string, by: 'word' | 'line'): Token[] {
  const pattern = by === 'word' ? /\s+|[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu : /[^\n]*\n|[^\n]+$/g
  return Array.from(s.matchAll(pattern), match => ({ t: match[0], at: match.index }))
}

type Step = 'eq' | 'del' | 'ins'

// Myers' path, ported from js/diff.js, with at most (cap + 1)^2 Int32 entries.
// Each row holds only its own diagonals, rather than a copy sized to the text.
function script(a: readonly Token[], b: readonly Token[], cap: number): Step[] | 'tooMany' {
  const trace: Int32Array[] = []
  for (let d = 0; d <= cap; d++) {
    const row = new Int32Array(2 * d + 1)
    const previous = trace[d - 1]
    const get = (k: number): number => previous?.[k + d - 1] ?? 0
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && get(k - 1) < get(k + 1)) ? get(k + 1) : get(k - 1) + 1
      let y = x - k
      while (x < a.length && y < b.length && a[x]!.t === b[y]!.t) { x++; y++ }
      row[k + d] = x
      if (x >= a.length && y >= b.length) {
        const steps: Step[] = []
        for (let depth = d; depth > 0; depth--) {
          const pv = trace[depth - 1]!
          const diagonal = x - y
          const at = (key: number): number => pv[key + depth - 1]!
          const prevK = diagonal === -depth || (diagonal !== depth && at(diagonal - 1) < at(diagonal + 1))
            ? diagonal + 1 : diagonal - 1
          const px = at(prevK)
          const py = px - prevK
          while (x > px && y > py) { steps.push('eq'); x--; y-- }
          steps.push(x === px ? 'ins' : 'del')
          x = px; y = py
        }
        while (x > 0 && y > 0) { steps.push('eq'); x--; y-- }
        return steps.reverse()
      }
    }
    trace.push(row)
  }
  return 'tooMany'
}

/** UTF-16 ranges replacing a with b, joining word changes one whitespace token apart. */
export function changes(sa: string, sb: string, opts: { by?: 'word' | 'line'; maxEdits?: number } = {}): DiffChange[] | 'tooMany' {
  if (sa === sb) return []
  const by = opts.by ?? 'word'
  const a = tokens(sa, by)
  const b = tokens(sb, by)
  let start = 0
  let aEnd = a.length
  let bEnd = b.length
  while (start < aEnd && start < bEnd && a[start]!.t === b[start]!.t) start++
  while (aEnd > start && bEnd > start && a[aEnd - 1]!.t === b[bEnd - 1]!.t) { aEnd--; bEnd-- }
  const cap = Math.min(opts.maxEdits ?? 2000, aEnd + bEnd - 2 * start)
  if (Math.abs(aEnd - bEnd) > cap) return 'tooMany'
  const steps = script(a.slice(start, aEnd), b.slice(start, bEnd), cap)
  if (steps === 'tooMany') return steps

  const end = (arr: readonly Token[], s: string, i: number): number => arr[i]?.at ?? s.length
  const out: DiffChange[] = []
  let cur: DiffChange | undefined
  let ia = start
  let ib = start
  let gap = 0
  for (const kind of steps) {
    if (kind === 'eq') {
      gap++
      const whitespace = /^\s+$/.test(a[ia]!.t)
      ia++; ib++
      if (cur && !(by === 'word' && gap === 1 && whitespace)) {
        out.push(cur); cur = undefined
      }
      continue
    }
    cur ??= { aFrom: end(a, sa, ia), aTo: end(a, sa, ia), bFrom: end(b, sb, ib), bTo: end(b, sb, ib) }
    gap = 0
    if (kind === 'del') ia++; else ib++
    cur.aTo = end(a, sa, ia)
    cur.bTo = end(b, sb, ib)
  }
  if (cur) out.push(cur)
  return out
}
