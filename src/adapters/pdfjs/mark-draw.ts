import type { PdfMark } from '../../app/ports'
import type { PdfLook } from '../../app/view'
import { drawNewText, type Entry, type NewTextPage } from './new-text-draw'

export type MarkPage = NewTextPage & {
  number: number
  marks: HTMLElement
  layer?: { textDivs: HTMLElement[]; textContentItemsStr: string[] }
}
const LABEL_LIMIT = 40

function textRange(page: MarkPage & { layer: NonNullable<MarkPage['layer']> }, item: number, start: number, end: number): Range | null {
  const node = page.layer.textDivs[item]?.firstChild
  if (!node || node.nodeType !== Node.TEXT_NODE) return null
  const length = page.layer.textContentItemsStr[item]?.length ?? 0
  if (start < 0 || end > length || end <= start) return null
  const range = document.createRange()
  range.setStart(node, start)
  range.setEnd(node, end)
  return range
}

function cut(words: string): string {
  return words.length > LABEL_LIMIT ? `${words.slice(0, LABEL_LIMIT - 1)}…` : words
}

/** Draws the marks of one page, replacing what its marks layer held; positions come from the layer's own rectangle. Returns the ids of marks that drew nothing. */
export function drawPageMarks(page: MarkPage, marks: readonly PdfMark[], look: PdfLook): Set<string> {
  const missing = new Set<string>()
  page.marks.replaceChildren()
  const layer = page.layer
  if (!layer) return missing
  const own = marks.filter(mark => mark.page === page.number)
  if (!own.length) return missing
  const origin = page.marks.getBoundingClientRect()
  const order = new Map<string, number>()
  own.forEach((mark, index) => { if (!order.has(mark.id)) order.set(mark.id, index) })
  const entries = new Map<string, Entry>()
  const entry = (mark: PdfMark, item: number): Entry => {
    let found = entries.get(mark.id)
    if (!found) entries.set(mark.id, found = { id: mark.id, n: order.get(mark.id) ?? 0, struck: [], family: getComputedStyle(layer.textDivs[item] ?? page.marks).fontFamily || 'sans-serif', caret: null })
    return found
  }
  const place = (mark: PdfMark, look: string, rect: { left: number; top: number; width: number; height: number }) => {
    const node = document.createElement('div')
    node.className = `gr-pdf-mark gr-pdf-${look}`
    node.dataset.id = mark.id
    node.dataset.n = String(order.get(mark.id))
    Object.assign(node.style, { left: `${rect.left - origin.left}px`, top: `${rect.top - origin.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
    page.marks.append(node)
    return node
  }
  const sized = { ...page, layer }
  for (const mark of own) {
    if (mark.look === 'insert') {
      const text = layer.textContentItemsStr[mark.item] ?? ''
      const width = mark.offset < text.length ? String.fromCodePoint(text.codePointAt(mark.offset)!).length : 1
      const range = textRange(sized, mark.item, mark.offset, mark.offset + width)
      const rect = range ? [...range.getClientRects()].find(r => r.width && r.height) : undefined
      if (!rect) { missing.add(mark.id); continue }
      if (look === 'new') { entry(mark, mark.item).caret = { left: mark.edge === 'after' ? rect.left + rect.width : rect.left, top: rect.top, words: mark.words }; continue }
      const bar = place(mark, 'caret', { left: mark.edge === 'after' ? rect.left + rect.width : rect.left, top: rect.top, width: 2, height: rect.height })
      const label = document.createElement('span')
      label.className = 'gr-pdf-label'
      label.textContent = cut(mark.words)
      bar.append(label)
      continue
    }
    let drew = false
    for (let item = mark.startItem; item <= mark.endItem; item++) {
      const length = layer.textContentItemsStr[item]?.length ?? 0
      const range = textRange(sized, item, item === mark.startItem ? mark.startOffset : 0, item === mark.endItem ? mark.endOffset : length)
      if (!range) continue
      for (const rect of range.getClientRects()) {
        if (!rect.width || !rect.height) continue
        drew = true
        if (look === 'new' && mark.look === 'struck') entry(mark, item).struck.push({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
        else place(mark, mark.look, rect)
      }
    }
    if (!drew) missing.add(mark.id)
  }
  if (look === 'new') {
    const { covers, words } = drawNewText([...entries.values()], page, origin)
    page.marks.prepend(...covers)
    page.marks.append(...words)
  }
  return missing
}
