import { fitWords } from '../../domain/pdf/fit-words'
import { BREAK_LABEL } from '../../app/brief'
import { backgroundOf, ringOf } from './background'

type Rect = { left: number; top: number; width: number; height: number }
/** A struck rectangle, with whether each side may be padded (a space or the item's edge lies beside it). */
type Struck = Rect & { padLeft?: boolean; padRight?: boolean }
const LABEL_LIMIT = 40
function cut(words: string): string {
  return words.length > LABEL_LIMIT ? `${words.slice(0, LABEL_LIMIT - 1)}…` : words
}
/** The struck rectangles of one item on a page in reading order, and the new words with their caret when this page holds it. */
export type Entry = { id: string; n: number; struck: Struck[]; family: string; weight: 'normal' | 'bold'; slant: 'normal' | 'italic'; size: number | null; caret: { left: number; top: number; words: string } | null }
export type NewTextPage = { canvas?: HTMLCanvasElement; measure?: (text: string, size: number, family: string, style?: string) => number; fontOf?: (item: number) => { family: string; weight: 'normal' | 'bold'; slant: 'normal' | 'italic' } | null }

let context: CanvasRenderingContext2D | null | undefined
function measureText(text: string, size: number, family: string, style = ''): number {
  context ??= document.createElement('canvas').getContext('2d')
  if (!context?.measureText) return text.length * size * 0.5
  context.font = `${style} ${size}px ${family}`.trim()
  return context.measureText(text).width
}
function imageOf(canvas: HTMLCanvasElement | undefined): ImageData | null {
  if (!canvas) return null
  try { return canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height) ?? null } catch { return null }
}

/** Gives a caret bar its words as a label shown only on hover, focus, or a click, so no label covers the page. */
export function labelCaret(bar: HTMLElement, words: string): void {
  const label = document.createElement('span')
  label.className = 'gr-pdf-label'
  label.textContent = cut(words)
  bar.append(label)
  bar.tabIndex = 0
  bar.setAttribute('aria-label', words)
  bar.addEventListener('click', () => {
    const open = !bar.classList.contains('gr-open')
    for (const other of bar.parentElement?.querySelectorAll('.gr-pdf-caret.gr-open') ?? []) other.classList.remove('gr-open')
    bar.classList.toggle('gr-open', open)
  })
}

const shorthand = (entry: Entry) => `${entry.slant === 'italic' ? 'italic ' : ''}${entry.weight === 'bold' ? 'bold' : ''}`.trim()
function styleOf(el: HTMLElement, entry: Entry) {
  el.style.fontFamily = entry.family
  el.style.fontWeight = entry.weight
  el.style.fontStyle = entry.slant
}

/** Builds the covers (drawn under comment highlights) and the new words and callouts (drawn over them); one canvas read serves every cover. */
export function drawNewText(entries: readonly Entry[], page: NewTextPage, origin: { left: number; top: number; width?: number }): { covers: HTMLElement[]; words: HTMLElement[] } {
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
  const measure = page.measure ?? measureText
  for (const entry of entries) {
    for (const rect of entry.struck) {
      const ring = ringOf(image, { left: rect.left - (box?.left ?? 0), top: rect.top - (box?.top ?? 0), width: rect.width, height: rect.height }, ratio)
      const padLeft = rect.padLeft === false ? 0 : 2, padRight = rect.padRight === false ? 0 : 2
      const cover = node(entry, 'cover', { left: rect.left - padLeft, top: rect.top - 1, width: rect.width + padLeft + padRight, height: rect.height + 2 })
      cover.style.backgroundColor = backgroundOf(ring)
      covers.push(cover)
    }
    const text = entry.caret?.words
    if (!text || !entry.caret || text === BREAK_LABEL) continue
    const last = entry.struck.at(-1)
    if (!last) continue
    const sizes = entry.struck.map(r => entry.size ?? r.height)
    const fit = fitWords(text, entry.struck.map((r, i) => ({ width: r.width, size: sizes[i]! })), (t, size) => measure(t, size, entry.family, shorthand(entry)))
    fit.lines.forEach((line, i) => {
      if (!line) return
      const el = node(entry, 'new', entry.struck[i]!, line)
      el.style.fontSize = `${sizes[i]}px`
      styleOf(el, entry)
      words.push(el)
    })
    if (fit.overflow) {
      const bar = node(entry, 'caret', { left: last.left + last.width, top: last.top, width: 2, height: last.height })
      labelCaret(bar, fit.overflow)
      words.push(bar)
    }
  }
  return { covers, words }
}
