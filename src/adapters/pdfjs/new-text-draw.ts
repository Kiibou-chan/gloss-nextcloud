import { fitWords } from '../../domain/pdf/fit-words'
import { backgroundOf, ringOf } from './background'

type Rect = { left: number; top: number; width: number; height: number }
/** The struck rectangles of one item on a page in reading order, and the new words with their caret when this page holds it. */
export type Entry = { id: string; n: number; struck: Rect[]; family: string; caret: { left: number; top: number; words: string } | null }
export type NewTextPage = { canvas?: HTMLCanvasElement; measure?: (text: string, size: number, family: string) => number }

let context: CanvasRenderingContext2D | null | undefined
function measureText(text: string, size: number, family: string): number {
  context ??= document.createElement('canvas').getContext('2d')
  if (!context?.measureText) return text.length * size * 0.5
  context.font = `${size}px ${family}`
  return context.measureText(text).width
}
function imageOf(canvas: HTMLCanvasElement | undefined): ImageData | null {
  if (!canvas) return null
  try { return canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height) ?? null } catch { return null }
}

/** Builds the covers (drawn under comment highlights) and the new words and callouts (drawn over them); one canvas read serves every cover. */
export function drawNewText(entries: readonly Entry[], page: NewTextPage, origin: { left: number; top: number }): { covers: HTMLElement[]; words: HTMLElement[] } {
  const covers: HTMLElement[] = [], words: HTMLElement[] = []
  const image = entries.some(e => e.struck.length) ? imageOf(page.canvas) : null
  const canvas = page.canvas
  const box = canvas?.getBoundingClientRect()
  const ratio = canvas ? canvas.width / (parseFloat(canvas.style.width) || canvas.width) : 1
  const node = (entry: Entry, kind: string, rect: Rect, text = '') => {
    const el = document.createElement('div')
    el.className = `gr-pdf-mark gr-pdf-${kind}`
    el.dataset.id = entry.id
    el.dataset.n = String(entry.n)
    el.textContent = text
    Object.assign(el.style, { left: `${rect.left - origin.left}px`, top: `${rect.top - origin.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
    return el
  }
  const callout = (entry: Entry, text: string, left: number, top: number) => {
    const el = node(entry, 'callout', { left, top, width: 0, height: 0 }, text)
    el.style.width = el.style.height = ''
    words.push(el)
  }
  for (const entry of entries) {
    for (const rect of entry.struck) {
      const ring = ringOf(image, { left: rect.left - (box?.left ?? 0), top: rect.top - (box?.top ?? 0), width: rect.width, height: rect.height }, ratio)
      const cover = node(entry, 'cover', { left: rect.left - 2, top: rect.top - 1, width: rect.width + 4, height: rect.height + 2 })
      cover.style.backgroundColor = backgroundOf(ring)
      covers.push(cover)
    }
    const text = entry.caret?.words
    if (!text || !entry.caret) continue
    const last = entry.struck.at(-1)
    if (!last) { callout(entry, text, entry.caret.left, entry.caret.top); continue }
    const measure = page.measure ?? measureText
    const fit = fitWords(text, entry.struck.map(r => ({ width: r.width, size: r.height })), (t, size) => measure(t, size, entry.family))
    fit.lines.forEach((line, i) => {
      if (!line) return
      const el = node(entry, 'new', entry.struck[i]!, line)
      el.style.fontSize = `${entry.struck[i]!.height}px`
      el.style.fontFamily = entry.family
      words.push(el)
    })
    if (fit.overflow) callout(entry, fit.overflow, last.left + last.width, last.top)
  }
  return { covers, words }
}
