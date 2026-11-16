import type { PdfMark } from '../../app/ports'

export type MarkPage = {
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

/** Draws the marks of one page, replacing what its marks layer held; positions come from the layer's own rectangle. */
export function drawPageMarks(page: MarkPage, marks: readonly PdfMark[]): void {
  page.marks.replaceChildren()
  const layer = page.layer
  if (!layer) return
  const own = marks.filter(mark => mark.page === page.number)
  if (!own.length) return
  const origin = page.marks.getBoundingClientRect()
  const order = new Map<string, number>()
  own.forEach((mark, index) => { if (!order.has(mark.id)) order.set(mark.id, index) })
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
      const range = textRange(sized, mark.item, mark.offset, mark.offset + 1)
      const rect = range ? [...range.getClientRects()].find(r => r.width && r.height) : undefined
      if (!rect) continue
      const bar = place(mark, 'caret', { left: mark.edge === 'after' ? rect.left + rect.width : rect.left, top: rect.top, width: 2, height: rect.height })
      const label = document.createElement('span')
      label.className = 'gr-pdf-label'
      label.textContent = cut(mark.words)
      bar.append(label)
      continue
    }
    for (let item = mark.startItem; item <= mark.endItem; item++) {
      const length = layer.textContentItemsStr[item]?.length ?? 0
      const range = textRange(sized, item, item === mark.startItem ? mark.startOffset : 0, item === mark.endItem ? mark.endOffset : length)
      if (!range) continue
      for (const rect of range.getClientRects()) {
        if (rect.width && rect.height) place(mark, mark.look, rect)
      }
    }
  }
}
