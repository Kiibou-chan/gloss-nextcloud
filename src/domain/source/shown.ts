import type { Op } from './typst-parse';

type TextOp = Extract<Op, { op: 'text' }>;
// Ops are ordered, disjoint source ranges and treated as immutable after parsing.
// Index once per parse, then visit only the ranges a card needs.
const indexes = new WeakMap<readonly Op[], readonly TextOp[]>();

/** Readable characters in [from, to), with whitespace collapsed. */
export function shown(text: string, ops: readonly Op[], from: number, to: number): string {
  if (to <= from) return '';
  let spans = indexes.get(ops);
  if (!spans) {
    spans = ops.filter((op): op is TextOp => op.op === 'text');
    indexes.set(ops, spans);
  }
  let low = 0;
  let high = spans.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (spans[mid]!.to <= from) low = mid + 1;
    else high = mid;
  }
  const parts: string[] = [];
  for (let i = low; i < spans.length; i++) {
    const op = spans[i]!;
    if (op.from >= to) break;
    parts.push(text.slice(Math.max(from, op.from), Math.min(to, op.to)));
  }
  return parts.join('').replace(/\s+/g, ' ').trim();
}
