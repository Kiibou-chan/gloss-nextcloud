import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { drawPageMarks } from '../../../src/adapters/pdfjs/mark-draw'
import type { PdfMark } from '../../../src/app/ports'

const TEXTS = ['Alpha beta', 'gamma delta']
const TINT = [244, 236, 216, 255]
let marks: HTMLElement
let getImageData: ReturnType<typeof vi.fn>
let canvasBox: { left: number; top: number }

// The canvas is drawn at ratio 2; its text rectangle (device pixels) is black, everything else the tinted paper.
function paper(rect: { left: number; top: number; width: number; height: number }) {
  const width = 400, height = 200
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const inside = x >= rect.left * 2 && x < (rect.left + rect.width) * 2 && y >= rect.top * 2 && y < (rect.top + rect.height) * 2
    data.set(inside ? [0, 0, 0, 255] : TINT, (y * width + x) * 4)
  }
  return { width, height, data }
}
type Font = { family: string; weight: 'normal' | 'bold'; slant: 'normal' | 'italic' }
function makePage(extra: { measure?: (text: string, size: number, family: string) => number; noCanvas?: boolean; fontOf?: (item: number) => Font } = {}) {
  marks = document.createElement('div')
  const divs = TEXTS.map(text => { const div = document.createElement('span'); div.textContent = text; div.style.fontSize = '12px'; return div })
  const canvas = document.createElement('canvas')
  canvas.width = 400; canvas.height = 200; canvas.style.width = '200px'
  canvas.getContext = (() => ({ getImageData })) as unknown as HTMLCanvasElement['getContext']
  return { number: 1, marks, layer: { textDivs: divs, textContentItemsStr: TEXTS }, canvas: extra.noCanvas ? undefined : canvas, measure: extra.measure ?? ((text: string) => text.length * 6), fontOf: extra.fontOf }
}
const struck = (id: string, startItem: number, startOffset: number, endItem: number, endOffset: number): PdfMark =>
  ({ id, page: 1, startItem, startOffset, endItem, endOffset, look: 'struck' })
const caret = (id: string, item: number, offset: number, edge: 'after' | 'before', words: string): PdfMark =>
  ({ id, page: 1, item, offset, edge, look: 'insert', words })
const kids = () => [...marks.children] as HTMLElement[]
const cls = (name: string) => kids().filter(k => k.classList.contains(name))

beforeEach(() => {
  canvasBox = { left: 13, top: 24 }
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return (this instanceof HTMLCanvasElement ? { ...canvasBox, width: 200, height: 100 } : { left: 11, top: 21 }) as DOMRect
  })
  // Each character is 10 px wide, items sit 20 px apart.
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: function (this: Range) {
    if (this.collapsed) return []
    const item = TEXTS.findIndex(text => this.startContainer.textContent === text)
    return [{ left: 100 + this.startOffset * 10, top: 50 + item * 20, width: (this.endOffset - this.startOffset) * 10, height: 12 }]
  } })
  // "Alpha" spans x 100 to 150 and y 50 to 62 on the page, so from the canvas's own corner x 87 to 137 and y 26 to 38.
  getImageData = vi.fn(() => paper({ left: 87, top: 26, width: 50, height: 12 }))
})
afterEach(() => vi.restoreAllMocks())

describe('undrawn ids in New text', () => {
  it('returns the ids of marks that drew nothing, and none for a covered or placed one', () => {
    const missing = drawPageMarks(makePage(), [struck('aaaaaaaaaa', 0, 0, 0, 5), struck('cccccccccc', 9, 0, 9, 2), caret('dddddddddd', 0, 99, 'after', 'x'), caret('eeeeeeeeee', 0, 4, 'after', 'flourish')], 'new')
    expect([...missing]).toEqual(['cccccccccc', 'dddddddddd'])
    expect(new Set(kids().map(k => k.dataset.id))).toEqual(new Set(['aaaaaaaaaa', 'eeeeeeeeee']))
  })
})

describe('a replacement in New text', () => {
  it('covers the struck rectangle two pixels larger beside spaces and at the item edge, one above and below, in the colour of the ring, measured from the canvas', () => {
    drawPageMarks(makePage(), [struck('aaaaaaaaaa', 0, 0, 0, 5), caret('aaaaaaaaaa', 0, 4, 'after', 'Omega')], 'new')
    const [cover] = cls('gr-pdf-cover')
    expect(cover!.dataset.id).toBe('aaaaaaaaaa')
    expect([cover!.style.left, cover!.style.top, cover!.style.width, cover!.style.height]).toEqual(['87px', '28px', '54px', '14px'])
    expect(cover!.style.backgroundColor).toBe('rgb(244, 236, 216)')
    expect(cls('gr-pdf-struck')).toHaveLength(0)
  })

  it('places the new words in the covered slot at the slot height, with no callout when they fit', () => {
    drawPageMarks(makePage(), [struck('aaaaaaaaaa', 0, 0, 0, 5), caret('aaaaaaaaaa', 0, 4, 'after', 'Omega')], 'new')
    const [word] = cls('gr-pdf-new')
    expect(word!.textContent).toBe('Omega')
    expect([word!.style.left, word!.style.top, word!.style.width, word!.style.height, word!.style.fontSize]).toEqual(['89px', '29px', '50px', '12px', '12px'])
    expect(word!.dataset.id).toBe('aaaaaaaaaa')
    expect(cls('gr-pdf-callout')).toHaveLength(0)
    expect(cls('gr-pdf-caret')).toHaveLength(0)
  })

  it('puts the words that do not fit into one callout at the end of the last slot', () => {
    drawPageMarks(makePage(), [struck('aaaaaaaaaa', 0, 0, 0, 5), caret('aaaaaaaaaa', 0, 4, 'after', 'Omega Sigma Tau')], 'new')
    expect(cls('gr-pdf-new').map(k => k.textContent)).toEqual(['Omega'])
    const callouts = cls('gr-pdf-callout')
    expect(callouts.map(k => k.textContent)).toEqual(['Sigma Tau'])
    expect([callouts[0]!.style.left, callouts[0]!.style.top]).toEqual(['139px', '29px'])
  })

  it('lays the words over two struck rectangles, each at its own height', () => {
    drawPageMarks(makePage(), [struck('aaaaaaaaaa', 0, 6, 1, 5), caret('aaaaaaaaaa', 1, 4, 'after', 'one two three four')], 'new')
    expect(cls('gr-pdf-cover')).toHaveLength(2)
    expect(cls('gr-pdf-new').map(k => k.textContent)).toEqual(['one', 'two'])
    expect(cls('gr-pdf-callout').map(k => k.textContent)).toEqual(['three four'])
  })
})

describe('the cover padding in New text', () => {
  const coverOf = (start: number, end: number) => { drawPageMarks(makePage(), [struck('aaaaaaaaaa', 0, start, 0, end)], 'new'); const c = cls('gr-pdf-cover')[0]!; return [parseFloat(c.style.left), parseFloat(c.style.left) + parseFloat(c.style.width)] }
  it('does not pad a side that has a letter or punctuation beside it', () => {
    TEXTS[0] = 'grow, beside'
    expect(coverOf(0, 4)).toEqual([89 - 2, 89 + 40])
    expect(coverOf(1, 3)).toEqual([89 + 10, 89 + 30])
    TEXTS[0] = 'Alpha beta'
    expect(coverOf(6, 10)).toEqual([89 + 60 - 2, 89 + 100 + 2])
  })
})

describe('the new words in New text', () => {
  it('takes the font size from the text div where it is known', () => {
    const real = window.getComputedStyle
    vi.spyOn(window, 'getComputedStyle').mockImplementation(el => { const s = real(el); return new Proxy(s, { get: (t, k) => (k === 'fontSize' ? '10px' : Reflect.get(t, k)) }) })
    drawPageMarks(makePage(), [struck('aaaaaaaaaa', 0, 0, 0, 5), caret('aaaaaaaaaa', 0, 4, 'after', 'Omega')], 'new')
    expect(cls('gr-pdf-new')[0]!.style.fontSize).toBe('10px')
  })
  it('draws only the cover for a blank replacement and not the line-break label', () => {
    drawPageMarks(makePage(), [struck('aaaaaaaaaa', 0, 0, 0, 5), caret('aaaaaaaaaa', 0, 4, 'after', '(line break)')], 'new')
    expect(cls('gr-pdf-cover')).toHaveLength(1)
    expect(cls('gr-pdf-new')).toHaveLength(0)
    expect(cls('gr-pdf-callout')).toHaveLength(0)
  })
})

describe('the callout in New text', () => {
  it('is cut at forty characters like a Changes label', () => {
    drawPageMarks(makePage(), [caret('cccccccccc', 0, 4, 'after', 'x'.repeat(60))], 'new')
    expect(cls('gr-pdf-callout')[0]!.textContent).toBe(`${'x'.repeat(39)}…`)
  })
  it('stays inside the page horizontally and below its top', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return (this instanceof HTMLCanvasElement ? { ...canvasBox, width: 200, height: 100 } : { left: 11, top: 21, width: 170, height: 100 }) as DOMRect
    })
    drawPageMarks(makePage(), [caret('cccccccccc', 0, 4, 'after', 'flourish')], 'new')
    const [callout] = cls('gr-pdf-callout')
    // 8 characters at 6 px per character plus padding and border, so at most 170 - width from the page's left edge
    expect(parseFloat(callout!.style.left)).toBeLessThanOrEqual(170 - 48)
    expect(parseFloat(callout!.style.left)).toBeGreaterThanOrEqual(0)
    expect(parseFloat(callout!.style.top)).toBeGreaterThanOrEqual(16)
  })
})

describe('an insertion and a deletion in New text', () => {
  it('draws a pure insertion as a callout at its caret and covers nothing', () => {
    drawPageMarks(makePage(), [caret('cccccccccc', 0, 4, 'after', 'flourish')], 'new')
    expect(cls('gr-pdf-cover')).toHaveLength(0)
    expect(cls('gr-pdf-new')).toHaveLength(0)
    const [callout] = cls('gr-pdf-callout')
    expect([callout!.textContent, callout!.style.left, callout!.style.top]).toEqual(['flourish', '139px', '29px'])
  })

  it('covers a pure deletion and draws nothing over it', () => {
    drawPageMarks(makePage(), [struck('dddddddddd', 0, 0, 0, 5)], 'new')
    expect(cls('gr-pdf-cover')).toHaveLength(1)
    expect(cls('gr-pdf-new')).toHaveLength(0)
    expect(cls('gr-pdf-callout')).toHaveLength(0)
    expect(marks.textContent).toBe('')
  })
})

describe('comments and the canvas in New text', () => {
  it('keeps a comment highlight above the cover', () => {
    const note: PdfMark = { id: 'bbbbbbbbbb', page: 1, startItem: 1, startOffset: 0, endItem: 1, endOffset: 5, look: 'note' }
    drawPageMarks(makePage(), [note, struck('aaaaaaaaaa', 0, 0, 0, 5)], 'new')
    expect(kids().map(k => k.className.replace('gr-pdf-mark ', ''))).toEqual(['gr-pdf-cover', 'gr-pdf-note'])
  })

  it('reads the canvas once per page draw, however many rectangles are struck', () => {
    const many = Array.from({ length: 300 }, (_, i) => struck(`s${String(i).padStart(9, '0')}`, 0, 0, 0, 5))
    const started = performance.now()
    drawPageMarks(makePage(), many, 'new')
    const ms = performance.now() - started
    console.log(`300 covers drawn in ${ms.toFixed(1)} ms`)
    expect(cls('gr-pdf-cover')).toHaveLength(300)
    expect(getImageData).toHaveBeenCalledTimes(1)
    expect(ms).toBeLessThan(3 * 300)
  })

  it('does not read the canvas in Changes', () => {
    drawPageMarks(makePage(), [struck('aaaaaaaaaa', 0, 0, 0, 5)], 'changes')
    expect(getImageData).not.toHaveBeenCalled()
    expect(cls('gr-pdf-struck')).toHaveLength(1)
    expect(cls('gr-pdf-cover')).toHaveLength(0)
  })

  it('covers in white when the canvas is missing or cannot be read', () => {
    drawPageMarks(makePage({ noCanvas: true }), [struck('aaaaaaaaaa', 0, 0, 0, 5)], 'new')
    expect(cls('gr-pdf-cover')[0]!.style.backgroundColor).toBe('rgb(255, 255, 255)')
    getImageData.mockImplementation(() => { throw new Error('tainted') })
    drawPageMarks(makePage(), [struck('aaaaaaaaaa', 0, 0, 0, 5)], 'new')
    expect(cls('gr-pdf-cover')[0]!.style.backgroundColor).toBe('rgb(255, 255, 255)')
  })
})

describe('the PDF font style in New text', () => {
  const serifBoldItalic: Font = { family: 'serif', weight: 'bold', slant: 'italic' }
  it('draws the new words in the item font family, weight, and slant at the item size', () => {
    drawPageMarks(makePage({ fontOf: item => item === 0 ? serifBoldItalic : { family: 'sans-serif', weight: 'normal', slant: 'normal' } }), [struck('aaaaaaaaaa', 0, 0, 0, 5), caret('aaaaaaaaaa', 0, 4, 'after', 'Omega')], 'new')
    const [word] = cls('gr-pdf-new')
    expect([word!.style.fontFamily, word!.style.fontWeight, word!.style.fontStyle, word!.style.fontSize]).toEqual(['serif', 'bold', 'italic', '12px'])
  })
  it('draws a bold sans item bold and upright', () => {
    drawPageMarks(makePage({ fontOf: () => ({ family: 'sans-serif', weight: 'bold', slant: 'normal' }) }), [struck('aaaaaaaaaa', 0, 0, 0, 5), caret('aaaaaaaaaa', 0, 4, 'after', 'Omega')], 'new')
    const [word] = cls('gr-pdf-new')
    expect([word!.style.fontFamily, word!.style.fontWeight, word!.style.fontStyle]).toEqual(['sans-serif', 'bold', 'normal'])
  })
  it('keeps the style family and normal weight and slant when no font is known', () => {
    drawPageMarks(makePage(), [struck('aaaaaaaaaa', 0, 0, 0, 5), caret('aaaaaaaaaa', 0, 4, 'after', 'Omega')], 'new')
    const [word] = cls('gr-pdf-new')
    expect([word!.style.fontWeight, word!.style.fontStyle]).toEqual(['normal', 'normal'])
    expect(word!.style.fontFamily).not.toBe('')
  })
  it('gives the callout the same weight and slant and measures with them', () => {
    const measure = vi.fn((text: string) => text.length * 6)
    drawPageMarks(makePage({ measure, fontOf: () => serifBoldItalic }), [caret('cccccccccc', 0, 4, 'after', 'flourish')], 'new')
    const [callout] = cls('gr-pdf-callout')
    expect([callout!.style.fontWeight, callout!.style.fontStyle, callout!.style.fontFamily]).toEqual(['bold', 'italic', 'serif'])
    expect(measure).toHaveBeenCalledWith('flourish', 11, 'serif', 'italic bold')
  })
})
