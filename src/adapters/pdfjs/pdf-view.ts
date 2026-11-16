import { isCommentShortcut } from '../browser/comment-shortcut'
import { getDocument, GlobalWorkerOptions, TextLayer } from 'pdfjs-dist'
import type { PDFPageProxy, PageViewport, RenderTask } from 'pdfjs-dist'
import type { PdfPort } from '../../app/ports'
import type { PdfPlacement } from '../../domain/pdf/match'
type Page = {
  number: number
  pdf: PDFPageProxy
  viewport: PageViewport
  content: Awaited<ReturnType<PDFPageProxy['getTextContent']>>
  box: HTMLElement
  marks: HTMLElement
  layer?: TextLayer
  drawing?: Promise<void>
  canvas?: HTMLCanvasElement
  text?: HTMLElement
  render?: RenderTask
  generation: number
}
/** The host is the PDF scroll container; matching uses cached text, never the DOM. */
export function createPdfView(el: HTMLElement, { url, workerUrl }: { url: string; workerUrl: string }): PdfPort {
  let disposed = false
  let task: ReturnType<typeof getDocument> | undefined
  let loading: ReturnType<PdfPort['show']> | undefined
  let pages: Page[] = []
  let placements: readonly PdfPlacement[] = []
  let observer: IntersectionObserver | undefined
  let viewportObserver: IntersectionObserver | undefined
  const visible = new Set<number>()
  let selected: Parameters<PdfPort['onSelect']>[0] | undefined
  function drawMarks(page: Page) {
    page.marks.replaceChildren()
    if (!page.layer) return
    const divs = page.layer.textDivs
    const strings = page.layer.textContentItemsStr
    for (const placement of placements) {
      if (placement.page !== page.number) continue
      const index = placements.findIndex(p => p.id === placement.id)
      for (let item = placement.startItem; item <= placement.endItem; item++) {
        const div = divs[item]
        const node = div?.firstChild
        if (!node || node.nodeType !== Node.TEXT_NODE) continue
        const range = document.createRange()
        const length = strings[item]?.length ?? 0
        const start = item === placement.startItem ? placement.startOffset : 0
        const end = item === placement.endItem ? placement.endOffset : length
        if (start < 0 || end > length || end <= start) continue
        range.setStart(node, start)
        range.setEnd(node, end)
        const box = page.box.getBoundingClientRect()
        for (const rect of range.getClientRects()) {
          if (!rect.width || !rect.height) continue
          const mark = document.createElement('div')
          mark.className = 'gr-pdf-mark'
          mark.dataset.id = placement.id
          mark.dataset.n = String(index)
          Object.assign(mark.style, {
            left: `${rect.left - box.left}px`, top: `${rect.top - box.top}px`,
            width: `${rect.width}px`, height: `${rect.height}px`,
          })
          page.marks.append(mark)
        }
      }
    }
  }
  function release(page: Page) {
    if (!page.canvas) return
    // A cancelled render may settle after this page has started drawing again.
    page.generation++
    page.render?.cancel()
    page.layer?.cancel()
    page.canvas.width = page.canvas.height = 0
    page.canvas.remove()
    page.text?.remove()
    page.marks.replaceChildren()
    page.canvas = undefined
    page.text = undefined
    page.layer = undefined
    page.render = undefined
    page.drawing = undefined
    page.pdf.cleanup()
  }

  function releaseDistant() {
    if (!visible.size) return
    for (const page of pages) {
      if ([...visible].every(number => Math.abs(number - page.number) > 10)) release(page)
    }
  }

  function draw(page: Page): Promise<void> {
    if (disposed) return Promise.resolve()
    if (page.drawing) return page.drawing
    const generation = ++page.generation
    page.drawing = (async () => {
      const canvas = document.createElement('canvas')
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.floor(page.viewport.width * ratio)
      canvas.height = Math.floor(page.viewport.height * ratio)
      canvas.style.width = `${page.viewport.width}px`
      canvas.style.height = `${page.viewport.height}px`
      const layer = document.createElement('div')
      layer.className = 'textLayer'
      layer.style.setProperty('--scale-factor', String(page.viewport.scale))
      // pdf.js 6 consumes the total scale and rounding variables itself.
      layer.style.setProperty('--total-scale-factor', String(page.viewport.scale))
      layer.style.setProperty('--scale-round-x', '1px')
      layer.style.setProperty('--scale-round-y', '1px')
      page.canvas = canvas
      page.text = layer
      page.box.prepend(canvas)
      page.box.append(layer)
      try {
        page.render = page.pdf.render({ canvas, viewport: page.viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] })
        await page.render.promise
        if (generation !== page.generation) return
        page.render = undefined
        const textLayer = new TextLayer({ textContentSource: page.content, container: layer, viewport: page.viewport })
        page.layer = textLayer
        await textLayer.render()
        if (generation !== page.generation) return
        drawMarks(page)
      } catch (error) {
        if (generation !== page.generation) return
        release(page)
        throw error
      }
    })()
    return page.drawing
  }
  async function load(): ReturnType<PdfPort['show']> {
    GlobalWorkerOptions.workerSrc = workerUrl
    task = getDocument({ url })
    const doc = await task.promise
    if (disposed) return { pages: [] }
    const style = getComputedStyle(el)
    const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
    const width = el.clientWidth ? Math.max(1, el.clientWidth - padding - 2) : 900
    const next: Page[] = []
    for (let number = 1; number <= doc.numPages; number++) {
      const pdf = await doc.getPage(number)
      if (disposed) return { pages: [] }
      const base = pdf.getViewport({ scale: 1 })
      const viewport = pdf.getViewport({ scale: width / base.width })
      const box = document.createElement('div')
      box.className = 'gr-page'
      box.dataset.page = String(number)
      box.style.width = `${viewport.width}px`
      box.style.height = `${viewport.height}px`
      const marks = document.createElement('div')
      marks.className = 'gr-pdf-marks'
      box.append(marks)
      const content = await pdf.getTextContent()
      if (disposed) return { pages: [] }
      next.push({ number, pdf, viewport, content, box, marks, generation: 0 })
    }
    pages = next
    el.replaceChildren(...pages.map(page => page.box))
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const page = pages.find(p => p.box === entry.target)
        if (page) void draw(page).catch(error => console.error('Could not draw PDF page', error))
      }
    }, { root: el, rootMargin: `${el.clientHeight || window.innerHeight}px 0px` })
    viewportObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const page = pages.find(p => p.box === entry.target)
        if (!page) continue
        if (entry.isIntersecting) visible.add(page.number)
        else visible.delete(page.number)
      }
      releaseDistant()
    }, { root: el, rootMargin: '0px' })
    for (const page of pages) {
      observer.observe(page.box)
      viewportObserver.observe(page.box)
    }
    return { pages: pages.map(page => page.content.items.flatMap(item => 'str' in item ? [item.str] : [])) }
  }
  function destroyTask() {
    const current = task
    task = undefined
    if (current) void current.destroy().catch(error => console.error('Could not destroy PDF document', error))
  }
  function reportSelection() {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode) return false
    if (!el.contains(selection.anchorNode) || !el.contains(selection.focusNode)) return false
    const text = selection.toString().trim()
    if (!text) return false
    const node = selection.anchorNode
    const box = (node.nodeType === Node.TEXT_NODE ? node.parentElement : node as Element | null)?.closest('.gr-page')
    const fraction = box && pages.length ? (Number((box as HTMLElement).dataset.page) - 0.5) / pages.length : 0.5
    selected?.({ text, fraction })
    return true
  }
  function commentKey(event: KeyboardEvent) {
    if (isCommentShortcut(event)) { event.preventDefault(); reportSelection() }
  }
  el.addEventListener('mouseup', reportSelection)
  el.addEventListener('keydown', commentKey)
  return {
    commentSelection: reportSelection,
    show() {
      if (disposed) return Promise.resolve({ pages: [] })
      loading ??= load().catch(error => {
        observer?.disconnect()
        viewportObserver?.disconnect()
        visible.clear()
        loading = undefined
        destroyTask()
        if (disposed) return { pages: [] }
        throw error
      })
      return loading
    },
    setMarks(next) {
      placements = next.filter((m): m is PdfPlacement & { look: 'note' | 'struck' } => m.look !== 'insert')
      for (const page of pages) drawMarks(page)
    },
    scrollToMark(id) {
      const placement = placements.find(p => p.id === id)
      const page = placement && pages[placement.page - 1]
      if (!page) return
      const mark = [...page.marks.children].find(child => (child as HTMLElement).dataset.id === id)
      ;(mark ?? page.box).scrollIntoView({ block: 'center', behavior: 'smooth' })
    },
    dispose() {
      if (disposed) return
      disposed = true
      destroyTask()
      observer?.disconnect(); viewportObserver?.disconnect()
      el.removeEventListener('mouseup', reportSelection); el.removeEventListener('keydown', commentKey)
      selected = undefined
      for (const page of pages) release(page)
    },
    onSelect(listener) { selected = listener; return () => { if (selected === listener) selected = undefined } },
  }
}
