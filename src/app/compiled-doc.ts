import { sourceKey, type SourceKey } from '../domain/pdf/match'
import { parseTypst, type Op } from '../domain/source/typst-parse'
import { fromDraft, toDraft, type Generated } from '../domain/typst/generated'

type Range = { from: number; to: number }
/** What a compiled PDF stands for: its text as a source key, and the maps between it and the draft. */
export type PdfDoc = {
  source: SourceKey
  /** Proposals the PDF shows itself, with its own strike and underline. */
  shown: ReadonlySet<string>
  /** Proposals whose new words are in the PDF without marks. */
  unmarked: ReadonlySet<string>
  toDraft(from: number, to: number): Range | null
  fromDraft(at: number): number
  newRange(id: string): Range | null
}

/** `generated` null stands for the draft compiled as it is. */
export function compiledDoc(file: string, draft: string, ops: readonly Op[], generated: Generated | null): PdfDoc {
  if (!generated) {
    return { source: sourceKey(file, draft, ops), shown: new Set(), unmarked: new Set(), toDraft: (from, to) => ({ from, to }), fromDraft: at => at, newRange: () => null }
  }
  const g = generated
  return {
    source: sourceKey(file, g.text, parseTypst(g.text)),
    shown: g.wrapped,
    unmarked: g.unmarked,
    toDraft: (from, to) => toDraft(g, from, to),
    fromDraft: at => fromDraft(g, at),
    newRange: id => { const s = g.segments.find(s => s.kind === 'new' && s.id === id); return s ? { from: s.at, to: s.at + s.length } : null },
  }
}
