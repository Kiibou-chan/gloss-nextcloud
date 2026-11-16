import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { drawPageMarks } from '../../../src/adapters/pdfjs/mark-draw'
import type { PdfMark } from '../../../src/app/ports'

const TEXTS = ['Alpha beta', 'gamma delta']
let marks: HTMLElement
let rectReads: Mock<(el: HTMLElement) => void>
let ranges: Range[]

function makePage(number = 1) {
  marks = document.createElement('div')
  const divs = TEXTS.map(text => {
    const div = document.createElement('span')
    div.textContent = text
    return div
  })
  return { number, marks, layer: { textDivs: divs, textContentItemsStr: TEXTS } }
}
const struck = (id: string, startItem: number, startOffset: number, endItem: number, endOffset: number, page = 1): PdfMark =>
  ({ id, page, startItem, startOffset, endItem, endOffset, look: 'struck' })
const caret = (id: string, item: number, offset: number, edge: 'after' | 'before', words: string, page = 1): PdfMark =>
  ({ id, page, item, offset, edge, look: 'insert', words })
const kids = () => [...marks.children] as HTMLElement[]

beforeEach(() => {
  ranges = []
  rectReads = vi.fn<(el: HTMLElement) => void>()
  // The marks layer sits inside a page box with a 1 px border: its rectangle starts at (11, 21).
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    rectReads(this)
    return { left: 11, top: 21 } as DOMRect
  })
  // Each character is 10 px wide, items sit 20 px apart, and a collapsed range has no rectangles.
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: function (this: Range) {
    ranges.push(this)
    if (this.collapsed) return []
    const item = TEXTS.findIndex(text => this.startContainer.textContent === text)
    return [{ left: 100 + this.startOffset * 10, top: 50 + item * 20, width: (this.endOffset - this.startOffset) * 10, height: 12 }]
  } })
})
afterEach(() => vi.restoreAllMocks())

describe('struck words', () => {
  it('draws one struck line per rectangle across two items, measured from the marks layer', () => {
    drawPageMarks(makePage(), [struck('aaaaaaaaaa', 0, 6, 1, 5)], 'changes')
    expect(kids().map(k => [k.className, k.dataset.id, k.style.left, k.style.top, k.style.width, k.style.height])).toEqual([
      ['gr-pdf-mark gr-pdf-struck', 'aaaaaaaaaa', '149px', '29px', '40px', '12px'],
      ['gr-pdf-mark gr-pdf-struck', 'aaaaaaaaaa', '89px', '49px', '50px', '12px'],
    ])
  })

  it('draws a note as gr-pdf-note and replaces what the page showed before', () => {
    const page = makePage()
    drawPageMarks(page, [struck('aaaaaaaaaa', 0, 0, 0, 5)], 'changes')
    drawPageMarks(page, [{ id: 'bbbbbbbbbb', page: 1, startItem: 1, startOffset: 0, endItem: 1, endOffset: 5, look: 'note' }], 'changes')
    expect(kids().map(k => [k.className, k.dataset.id])).toEqual([['gr-pdf-mark gr-pdf-note', 'bbbbbbbbbb']])
  })

  it('keeps one data-n per id, in the order the ids first appear', () => {
    drawPageMarks(makePage(), [struck('aaaaaaaaaa', 0, 0, 0, 2), struck('bbbbbbbbbb', 1, 0, 1, 2), struck('aaaaaaaaaa', 0, 3, 0, 5)], 'changes')
    expect(kids().map(k => k.dataset.n)).toEqual(['0', '1', '0'])
  })

  it('skips marks whose offsets do not fit their text', () => {
    drawPageMarks(makePage(), [struck('aaaaaaaaaa', 0, 4, 0, 99), struck('bbbbbbbbbb', 0, 3, 0, 3), struck('cccccccccc', 9, 0, 9, 2)], 'changes')
    expect(kids()).toHaveLength(0)
  })
})

describe('carets', () => {
  it('draws an after caret at the right edge of the character before the point', () => {
    drawPageMarks(makePage(), [caret('cccccccccc', 0, 4, 'after', 'new')], 'changes')
    const bar = kids()[0]!
    expect(bar.className).toBe('gr-pdf-mark gr-pdf-caret')
    expect(bar.dataset.id).toBe('cccccccccc')
    // The character at offset 4 spans x 140 to 150, so its right edge is 150, less the layer's 11 px.
    expect([bar.style.left, bar.style.top, bar.style.height]).toEqual(['139px', '29px', '12px'])
    expect(bar.querySelector('.gr-pdf-label')!.textContent).toBe('new')
  })

  it('draws a before caret at the left edge of the character after the point', () => {
    drawPageMarks(makePage(), [caret('cccccccccc', 1, 6, 'before', 'x')], 'changes')
    // The character at offset 6 spans x 160 to 170, so its left edge is 160.
    expect([kids()[0]!.style.left, kids()[0]!.style.top]).toEqual(['149px', '49px'])
  })

  it('reads one character rectangle and never a collapsed range', () => {
    drawPageMarks(makePage(), [caret('cccccccccc', 0, 4, 'after', 'new'), caret('dddddddddd', 0, 4, 'before', 'new')], 'changes')
    expect(kids()).toHaveLength(2)
    expect(ranges.every(r => !r.collapsed && r.endOffset - r.startOffset === 1)).toBe(true)
  })

  it('cuts a 41-character label to 40 with an ellipsis and keeps 40 whole', () => {
    drawPageMarks(makePage(), [caret('cccccccccc', 0, 1, 'after', 'a'.repeat(41)), caret('dddddddddd', 0, 1, 'after', 'b'.repeat(40))], 'changes')
    const [long, whole] = kids().map(k => k.querySelector('.gr-pdf-label')!.textContent!)
    expect(long).toBe(`${'a'.repeat(39)}…`)
    expect(long).toHaveLength(40)
    expect(whole).toBe('b'.repeat(40))
  })

  it('shows "(line break)" as it is', () => {
    drawPageMarks(makePage(), [caret('cccccccccc', 0, 1, 'after', '(line break)')], 'changes')
    expect(kids()[0]!.querySelector('.gr-pdf-label')!.textContent).toBe('(line break)')
  })

  it('skips a caret whose character is missing', () => {
    drawPageMarks(makePage(), [caret('cccccccccc', 0, 10, 'after', 'x'), caret('dddddddddd', 5, 0, 'after', 'x')], 'changes')
    expect(kids()).toHaveLength(0)
  })
})

describe('per page', () => {
  it('draws only the marks of its own page', () => {
    drawPageMarks(makePage(2), [struck('aaaaaaaaaa', 0, 0, 0, 2, 1), struck('bbbbbbbbbb', 0, 0, 0, 2, 2), caret('cccccccccc', 0, 1, 'after', 'x', 3)], 'changes')
    expect(kids().map(k => k.dataset.id)).toEqual(['bbbbbbbbbb'])
  })

  it('reads the marks layer rectangle once, however many marks it draws', () => {
    drawPageMarks(makePage(), [struck('aaaaaaaaaa', 0, 0, 0, 2), struck('bbbbbbbbbb', 1, 0, 1, 2), caret('cccccccccc', 0, 1, 'after', 'x')], 'changes')
    expect(kids()).toHaveLength(3)
    expect(rectReads.mock.calls.map(c => c[0])).toEqual([marks])
  })

  it('clears the layer and draws nothing when the page has no text layer', () => {
    const page = makePage()
    marks.append(document.createElement('div'))
    drawPageMarks({ number: 1, marks: page.marks }, [struck('aaaaaaaaaa', 0, 0, 0, 2)], 'changes')
    expect(kids()).toHaveLength(0)
  })
})
