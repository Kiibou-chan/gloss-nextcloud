import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createPdfView } from '../../../src/adapters/pdfjs/pdf-view'

const pdf = vi.hoisted(() => ({ getDocument: vi.fn(), options: { workerSrc: '' } }))
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: pdf.options,
  getDocument: pdf.getDocument,
  TextLayer: class {
    textDivs: HTMLElement[] = []
    textContentItemsStr: string[] = []
    constructor(private options: { container: HTMLElement; textContentSource: { items: ({ str: string } | { type: string })[] } }) {}
    async render() {
      for (const item of this.options.textContentSource.items) {
        if (!('str' in item)) continue
        const div = document.createElement('span')
        div.textContent = item.str
        this.textDivs.push(div)
        this.textContentItemsStr.push(item.str)
        this.options.container.append(div)
      }
    }
    cancel() {}
  },
}))

class Observer {
  static instances: Observer[] = []
  targets = new Set<Element>()
  constructor(private callback: IntersectionObserverCallback, readonly options: IntersectionObserverInit) {
    Observer.instances.push(this)
  }
  observe = (el: Element) => { this.targets.add(el) }
  unobserve = (el: Element) => { this.targets.delete(el) }
  disconnect = () => { this.targets.clear() }
  takeRecords = () => []
  emit(target: Element, isIntersecting = true) {
    this.callback([{ target, isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
}

function makePage(n: number) {
  const width = n % 2 ? 600 : 300
  return {
    getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: width * scale, height: 800 * scale, scale })),
    // Marked-content records must not change the domain's text item indexes.
    getTextContent: vi.fn(async () => ({ items: [{ type: 'beginMarkedContent' }, { str: `Page ${n}` }, { str: ' synthetic words' }], styles: {} })),
    render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
    commonObjs: { has: () => false, get: () => null },
    cleanup: vi.fn(),
  }
}
let host: HTMLElement
let pages: ReturnType<typeof makePage>[]
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)) }
const boxes = () => [...host.querySelectorAll<HTMLElement>('.gr-page')]
function observe(index: number, on = true) {
  const box = boxes()[index]!
  const observer = Observer.instances.find(o => o.targets.has(box))!
  observer.emit(box, on)
}
const placement = (page = 1, id = 'abcdefghij') => ({ id, page, startItem: 0, startOffset: 2, endItem: 1, endOffset: 4, look: 'note' as const })

beforeEach(() => {
  vi.clearAllMocks()
  Observer.instances = []
  vi.stubGlobal('IntersectionObserver', Observer)
  vi.stubGlobal('devicePixelRatio', 2)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20 } as DOMRect)
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: function (this: Range) {
    return this.toString() ? [{ left: 25, top: 40, width: 50, height: 12 }] : []
  } })
  host = document.createElement('article')
  Object.defineProperty(host, 'clientWidth', { value: 600, configurable: true })
  Object.defineProperty(host, 'clientHeight', { value: 700, configurable: true })
  document.body.append(host)
  pages = [1, 2, 3].map(makePage)
  pdf.getDocument.mockImplementation(() => ({ promise: Promise.resolve({ numPages: pages.length, getPage: vi.fn(async (n: number) => pages[n - 1]) }), destroy: vi.fn(async () => {}) }))
})
afterEach(() => {
  window.getSelection()?.removeAllRanges()
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const create = () => createPdfView(host, { url: '/synthetic.pdf', workerUrl: '/apps/gloss/js/pdf.worker.js' })

describe('generated PDF text layer CSS', () => {
  it.each([90, 180, 270])('transforms a text layer with main rotation %i', rotation => {
    const style = document.createElement('style')
    style.textContent = readFileSync('css/pdf-text-layer.css', 'utf8')
    document.body.append(style)
    const layer = document.createElement('div')
    layer.className = 'textLayer'
    layer.dataset.mainRotation = String(rotation)
    host.append(layer)
    expect(getComputedStyle(layer).transform).toContain(`rotate(${rotation}deg)`)
  })
})

describe('PDF view', () => {
  it('lays out every page at its own size before any canvas is drawn, loading only once', async () => {
    const view = create()
    expect(pdf.getDocument).not.toHaveBeenCalled()
    const [first, second] = await Promise.all([view.show(), view.show()])
    expect(second).toBe(first)
    expect(pdf.getDocument).toHaveBeenCalledExactlyOnceWith({ url: '/synthetic.pdf', fontExtraProperties: true })
    expect(pdf.options.workerSrc).toBe('/apps/gloss/js/pdf.worker.js')
    expect(boxes().map(b => [b.style.width, b.style.height])).toEqual([
      ['598px', `${800 * (598 / 600)}px`], ['598px', `${800 * (598 / 300)}px`], ['598px', `${800 * (598 / 600)}px`],
    ])
    expect(host.querySelector('canvas')).toBeNull()
    expect(pages.every(p => p.render.mock.calls.length === 0)).toBe(true)
    expect(first.pages).toEqual([['Page 1', ' synthetic words'], ['Page 2', ' synthetic words'], ['Page 3', ' synthetic words']])
    await view.show()
    expect(pages.every(p => p.getTextContent.mock.calls.length === 1)).toBe(true)
  })

  it('uses 900 px when the host has no width', async () => {
    Object.defineProperty(host, 'clientWidth', { value: 0 })
    await create().show()
    expect(boxes()[0]!.style.width).toBe('900px')
  })

  it('observes one screen beyond the scroll view and draws canvas and text only on entry', async () => {
    const view = create()
    await view.show()
    expect(Observer.instances[0]!.options).toMatchObject({ root: host, rootMargin: '700px 0px' })
    observe(1)
    observe(1)
    await settle()
    expect(pages[1]!.render).toHaveBeenCalledTimes(1)
    const canvas = boxes()[1]!.querySelector('canvas')!
    expect([canvas.width, canvas.height, canvas.style.width, canvas.style.height]).toEqual([1196, Math.floor(2 * 800 * (598 / 300)), '598px', `${800 * (598 / 300)}px`])
    expect(pages[1]!.render).toHaveBeenCalledWith(expect.objectContaining({ canvas, transform: [2, 0, 0, 2, 0, 0] }))
    expect(boxes()[1]!.querySelector('.textLayer')!.textContent).toBe('Page 2 synthetic words')
    expect((boxes()[1]!.querySelector('.textLayer') as HTMLElement).style.getPropertyValue('--scale-factor')).toBe(String(598 / 300))
    expect(host.querySelectorAll('canvas')).toHaveLength(1)
  })

  it('places marks using the exact text item offsets, including marks queued before drawing', async () => {
    const view = create()
    view.setMarks([placement(), placement(3, 'latermark1')])
    await view.show()
    expect(host.querySelector('.gr-pdf-mark')).toBeNull()
    const start = vi.spyOn(Range.prototype, 'setStart')
    const end = vi.spyOn(Range.prototype, 'setEnd')
    observe(0)
    await settle()
    let mark = boxes()[0]!.querySelector<HTMLElement>('.gr-pdf-mark')!
    expect(mark.dataset.id).toBe('abcdefghij')
    expect(mark.dataset.n).toBe('0')
    expect([mark.style.left, mark.style.top, mark.style.width, mark.style.height]).toEqual(['15px', '20px', '50px', '12px'])
    expect(start).toHaveBeenCalledWith(boxes()[0]!.querySelector('span')!.firstChild, 2)
    expect(end).toHaveBeenCalledWith(boxes()[0]!.querySelectorAll('span')[1]!.firstChild, 4)
    observe(2)
    await settle()
    expect(boxes()[2]!.querySelector<HTMLElement>('.gr-pdf-mark')!.dataset.id).toBe('latermark1')
    view.setMarks([placement(3, 'replacement')])
    expect(boxes()[0]!.querySelector('.gr-pdf-mark')).toBeNull()
    mark = boxes()[2]!.querySelector<HTMLElement>('.gr-pdf-mark')!
    expect(mark.dataset.id).toBe('replacement')
    view.setMarks([])
    expect(host.querySelector('.gr-pdf-mark')).toBeNull()
  })

  it('setLook redraws the drawn pages: a struck mark becomes a cover in New text and back', async () => {
    const view = create(); await view.show(); observe(0); await settle()
    view.setMarks([{ ...placement(), look: 'struck' }])
    expect(boxes()[0]!.querySelector('.gr-pdf-struck')).not.toBeNull()
    view.setLook('new')
    expect(boxes()[0]!.querySelector('.gr-pdf-struck')).toBeNull()
    expect(boxes()[0]!.querySelector('.gr-pdf-cover')!.getAttribute('data-id')).toBe('abcdefghij')
    view.setLook('changes')
    expect(boxes()[0]!.querySelector('.gr-pdf-cover')).toBeNull()
    expect(boxes()[0]!.querySelector('.gr-pdf-struck')).not.toBeNull()
  })

  it('draws a page that renders after setLook in the look set', async () => {
    const view = create(); await view.show()
    view.setMarks([{ ...placement(), look: 'struck' }]); view.setLook('new')
    observe(0); await settle()
    expect(boxes()[0]!.querySelector('.gr-pdf-cover')).not.toBeNull()
  })

  it('scrolls to a pending mark before the target page has drawn', async () => {
    const scroll = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll })
    const view = create()
    await view.show()
    view.setMarks([placement(3, 'pending-id')])
    view.scrollToMark('pending-id')
    expect(scroll.mock.instances[0]).toBe(boxes()[2])
    observe(2)
    await settle()
    view.scrollToMark('pending-id')
    expect(scroll.mock.instances.at(-1)).toBe(boxes()[2]!.querySelector('.gr-pdf-mark'))
    view.scrollToMark('unknown')
    expect(scroll).toHaveBeenCalledTimes(2)
  })

  it('draws struck words and carets together and scrolls to a caret', async () => {
    const scroll = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll })
    const view = create()
    await view.show()
    view.setMarks([
      { ...placement(1, 'struckmark1'), look: 'struck' },
      { id: 'caretmark01', page: 3, item: 0, offset: 1, edge: 'after', look: 'insert', words: 'new words' },
    ])
    observe(0)
    observe(2)
    await settle()
    expect(boxes()[0]!.querySelector('.gr-pdf-struck')!.getAttribute('data-id')).toBe('struckmark1')
    const bar = boxes()[2]!.querySelector<HTMLElement>('.gr-pdf-caret')!
    expect(bar.querySelector('.gr-pdf-label')!.textContent).toBe('new words')
    view.scrollToMark('caretmark01')
    expect(scroll.mock.instances.at(-1)).toBe(bar)
  })

  it('draws New text in the PDF font read from the page', async () => {
    (pages[0]!.getTextContent as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [{ str: 'Page 1', fontName: 'g_d0_f1' }, { str: ' synthetic words', fontName: 'g_d0_f2' }], styles: { g_d0_f1: { fontFamily: 'serif' }, g_d0_f2: { fontFamily: 'sans-serif' } } })
    Object.assign(pages[0]!, { commonObjs: { has: () => true, get: (id: string) => id === 'g_d0_f1' ? { name: 'ABCDEF+Serif-BoldItalic' } : { name: 'Sans', bold: false } } })
    const view = create()
    await view.show()
    view.setLook('new')
    view.setMarks([{ ...placement(1, 'struckmark1'), startItem: 0, startOffset: 0, endItem: 0, endOffset: 4, look: 'struck' }, { id: 'struckmark1', page: 1, item: 0, offset: 3, edge: 'after', look: 'insert', words: 'Omega' }])
    observe(0)
    await settle()
    const word = boxes()[0]!.querySelector<HTMLElement>('.gr-pdf-new')!
    expect([word.style.fontFamily, word.style.fontWeight, word.style.fontStyle]).toEqual(['serif', 'bold', 'italic'])
  })

  it.each([0, 1, 2])('reports selected text and the centre fraction of page %i', async index => {
    const view = create()
    const listener = vi.fn()
    view.onSelect(listener)
    await view.show()
    observe(index)
    await settle()
    const text = boxes()[index]!.querySelector('span')!.firstChild!
    const range = document.createRange()
    range.selectNodeContents(text)
    window.getSelection()!.addRange(range)
    boxes()[index]!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    expect(listener).toHaveBeenCalledExactlyOnceWith({ text: `Page ${index + 1}`, fraction: (index + 0.5) / 3 })
  })

  it('ignores keyboard selections until an explicit comment action', async () => {
    const view = create()
    const listener = vi.fn()
    view.onSelect(listener)
    await view.show()
    observe(0)
    await settle()
    const range = document.createRange()
    range.selectNodeContents(boxes()[0]!.querySelector('span')!.firstChild!)
    window.getSelection()!.addRange(range)
    host.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', shiftKey: true, bubbles: true }))
    expect(listener).not.toHaveBeenCalled()
    expect(view.commentSelection?.()).toBe(true)
    expect(listener).toHaveBeenCalledExactlyOnceWith({ text: 'Page 1', fraction: 0.5 / 3 })
    listener.mockClear()
    const event = new KeyboardEvent('keydown', { key: 'µ', code: 'KeyM', ctrlKey: true, altKey: true, bubbles: true, cancelable: true })
    host.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(listener).toHaveBeenCalledExactlyOnceWith({ text: 'Page 1', fraction: 0.5 / 3 })
  })

  it('ignores empty selections and selections outside the PDF view', async () => {
    const view = create()
    const listener = vi.fn()
    view.onSelect(listener)
    await view.show()
    host.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    const outside = document.createTextNode('outside synthetic selection')
    document.body.append(outside)
    const range = document.createRange()
    range.selectNodeContents(outside)
    window.getSelection()!.addRange(range)
    host.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    expect(listener).not.toHaveBeenCalled()
  })

  it('allows retrying a failed load', async () => {
    pdf.getDocument.mockImplementationOnce(() => ({ promise: Promise.reject(new Error('offline')), destroy: vi.fn(async () => {}) }))
    const view = create()
    await expect(view.show()).rejects.toThrow('offline')
    await expect(view.show()).resolves.toHaveProperty('pages')
  })
})

describe('distant canvas releasing', () => {
  function visible(index: number, on = true) {
    const observer = Observer.instances.find(o => o.options.rootMargin === '0px')
    expect(observer, 'a viewport observer tracks the pages actually in view').toBeDefined()
    observer!.emit(boxes()[index]!, on)
  }

  it('releases pages more than ten pages away, retaining their layout and cached text for redrawing', async () => {
    pages = Array.from({ length: 24 }, (_, index) => makePage(index + 1))
    const view = create()
    await view.show()
    view.setMarks([placement(1)])
    observe(0)
    observe(1)
    await settle()
    const firstBox = boxes()[0]!
    const canvas = firstBox.querySelector('canvas')!
    expect(firstBox.querySelector('.gr-pdf-mark')).not.toBeNull()
    visible(11)
    expect(firstBox.querySelector('canvas')).toBeNull()
    expect([canvas.width, canvas.height]).toEqual([0, 0])
    expect(firstBox.querySelector('.textLayer')).toBeNull()
    expect(firstBox.querySelector('.gr-pdf-mark')).toBeNull()
    expect(firstBox.style.height).toBe(`${800 * (598 / 600)}px`)
    expect(boxes()).toHaveLength(24)
    expect(pages[0]!.cleanup).toHaveBeenCalledTimes(1)
    // Page 2 is exactly ten pages from page 12, so its canvas stays.
    expect(boxes()[1]!.querySelector('canvas')).not.toBeNull()
    visible(11, false)
    visible(0)
    observe(0)
    await settle()
    expect(pages[0]!.render).toHaveBeenCalledTimes(2)
    expect(pages[0]!.getTextContent).toHaveBeenCalledTimes(1)
    expect(firstBox.querySelector('.gr-pdf-mark')).not.toBeNull()
  })

  it('keeps a page while any visible page is within ten pages of it', async () => {
    pages = Array.from({ length: 24 }, (_, index) => makePage(index + 1))
    await create().show()
    observe(0)
    await settle()
    visible(0)
    visible(23)
    expect(boxes()[0]!.querySelector('canvas')).not.toBeNull()
    visible(0, false)
    expect(boxes()[0]!.querySelector('canvas')).toBeNull()
  })

  it('cancels distant in-flight drawing without letting its completion remove a new canvas', async () => {
    pages = Array.from({ length: 24 }, (_, index) => makePage(index + 1))
    let finish!: () => void
    const cancel = vi.fn()
    pages[0]!.render.mockReturnValueOnce({ promise: new Promise<void>(resolve => { finish = resolve }), cancel })
    await create().show()
    observe(0)
    await settle()
    visible(23)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(boxes()[0]!.querySelector('canvas')).toBeNull()
    visible(23, false)
    visible(0)
    observe(0)
    await settle()
    const newCanvas = boxes()[0]!.querySelector('canvas')!
    expect(newCanvas).not.toBeNull()
    finish()
    await settle()
    expect(boxes()[0]!.querySelector('canvas')).toBe(newCanvas)
    expect(boxes()[0]!.querySelectorAll('.textLayer')).toHaveLength(1)
  })
})


describe('PDF disposal', () => {
  it.each(['document', 'page', 'text'])('stops a pending %s load without creating observers after disposal', async stage => {
    let resume!: () => void
    const gate = new Promise<void>(resolve => { resume = resolve })
    const doc = { numPages: 1, getPage: vi.fn(async () => { if (stage === 'page') await gate; return pages[0]! }) }
    const original = pages[0]!.getTextContent.getMockImplementation()!
    pages[0]!.getTextContent.mockImplementation(async () => { if (stage === 'text') await gate; return original() })
    const destroy = vi.fn(async () => {})
    pdf.getDocument.mockReturnValueOnce({ promise: (async () => { if (stage === 'document') await gate; return doc })(), destroy })
    const view = create(); const showing = view.show()
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    view.dispose!(); resume(); await showing
    expect(Observer.instances.flatMap(o => [...o.targets])).toEqual([])
    expect(host.childNodes).toHaveLength(0)
    expect(destroy).toHaveBeenCalledTimes(1)
    await view.show(); expect(pdf.getDocument).toHaveBeenCalledTimes(1)
  })
  it('destroys the loaded document and disconnects all observers once', async () => {
    const destroy = vi.fn(async () => {})
    pdf.getDocument.mockReturnValueOnce({ promise: Promise.resolve({ numPages: 1, getPage: async () => pages[0] }), destroy })
    const view = create(); await view.show(); view.dispose!(); view.dispose!()
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(Observer.instances.flatMap(o => [...o.targets])).toEqual([])
  })
})

describe('showBytes', () => {
  const bytes = () => new Uint8Array([37, 80, 68, 70])
  const docOf = (count: number) => ({ numPages: count, getPage: vi.fn(async (n: number) => makePage(n)) })
  const taskOf = (count: number) => ({ promise: Promise.resolve(docOf(count)), destroy: vi.fn(async () => {}) })
  function scrolling(height: number) {
    let top = 0
    Object.defineProperty(host, 'scrollHeight', { configurable: true, get: () => height })
    Object.defineProperty(host, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = v } })
    return { set: (v: number) => { top = v } }
  }

  it('loads the bytes, replaces the pages, and resolves the new text items', async () => {
    const view = create(); await view.show()
    const old = boxes()
    pdf.getDocument.mockReturnValueOnce(taskOf(2))
    const shown = await view.showBytes!(bytes())
    expect(pdf.getDocument).toHaveBeenLastCalledWith({ data: bytes(), fontExtraProperties: true })
    expect(shown.pages).toEqual([['Page 1', ' synthetic words'], ['Page 2', ' synthetic words']])
    expect(boxes()).toHaveLength(2)
    expect(boxes().some(b => old.includes(b))).toBe(false)
  })

  it('keeps scrollTop, clamped when the new document is shorter', async () => {
    const view = create(); await view.show()
    const s = scrolling(2000)
    s.set(900)
    pdf.getDocument.mockReturnValueOnce(taskOf(3))
    await view.showBytes!(bytes())
    expect(host.scrollTop).toBe(900)
    Object.defineProperty(host, 'scrollHeight', { configurable: true, get: () => 1000 })
    s.set(900)
    pdf.getDocument.mockReturnValueOnce(taskOf(1))
    await view.showBytes!(bytes())
    expect(host.scrollTop).toBe(300)
  })

  it('loads the uploaded PDF again on show() after showBytes', async () => {
    const view = create(); await view.show()
    pdf.getDocument.mockReturnValueOnce(taskOf(1))
    await view.showBytes!(bytes())
    const shown = await view.show()
    expect(pdf.getDocument).toHaveBeenLastCalledWith({ url: '/synthetic.pdf', fontExtraProperties: true })
    expect(shown.pages).toHaveLength(3)
  })

  it('destroys the previous loading task and disconnects its observers', async () => {
    const first = { promise: Promise.resolve({ numPages: 1, getPage: async () => makePage(1) }), destroy: vi.fn(async () => {}) }
    pdf.getDocument.mockReturnValueOnce(first)
    const view = create(); await view.show()
    const before = Observer.instances.length
    pdf.getDocument.mockReturnValueOnce(taskOf(1))
    await view.showBytes!(bytes())
    expect(first.destroy).toHaveBeenCalledTimes(1)
    expect(Observer.instances.slice(0, before).flatMap(o => [...o.targets])).toEqual([])
    expect(Observer.instances.slice(before).flatMap(o => [...o.targets])).toHaveLength(2)
  })

  it('draws the visible pages before the container children are swapped', async () => {
    const view = create(); await view.show()
    const second = taskOf(2)
    pdf.getDocument.mockReturnValueOnce(second)
    const swapped = vi.spyOn(host, 'replaceChildren')
    let drawnAtSwap = -1
    swapped.mockImplementation(function (this: HTMLElement, ...nodes: (Node | string)[]) {
      drawnAtSwap = nodes.filter(n => n instanceof HTMLElement && n.querySelector('canvas')).length
      return Element.prototype.replaceChildren.apply(this, nodes)
    })
    await view.showBytes!(bytes())
    expect(drawnAtSwap).toBeGreaterThan(0)
    expect(boxes()[0]!.querySelector('canvas')).not.toBeNull()
  })

  it('keeps the old document when the new bytes fail to load', async () => {
    const view = create(); await view.show()
    const old = boxes()
    pdf.getDocument.mockReturnValueOnce({ promise: Promise.reject(new Error('bad')), destroy: vi.fn(async () => {}) })
    await expect(view.showBytes!(bytes())).rejects.toThrow('bad')
    expect(boxes()).toEqual(old)
  })
})

it('fits the page and its border inside the padded PDF pane', async () => {
  host.style.padding = '12px'
  const view = create(); await view.show()
  expect(boxes()[0]!.style.width).toBe('574px')
  view.dispose?.()
})
