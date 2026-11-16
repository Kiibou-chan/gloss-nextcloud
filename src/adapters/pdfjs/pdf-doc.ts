import { getDocument } from 'pdfjs-dist'
import type { PDFPageProxy, PageViewport, RenderTask, TextLayer } from 'pdfjs-dist'

export type Page = {
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
export type DocSource = { url: string } | { data: Uint8Array }
export type OpenDoc = { task: ReturnType<typeof getDocument>; pages: Page[] }

function pageWidth(el: HTMLElement) {
  const style = getComputedStyle(el)
  const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
  return el.clientWidth ? Math.max(1, el.clientWidth - padding - 2) : 900
}

/** Loads a document and lays out its pages; a stale or failed load destroys its own task and returns null. */
export async function openDoc(el: HTMLElement, source: DocSource, stale: () => boolean): Promise<OpenDoc | null> {
  const task = getDocument({ ...('data' in source ? { data: source.data.slice() } : source), fontExtraProperties: true })
  const stop = () => { void task.destroy().catch(error => console.error('Could not destroy PDF document', error)); return null }
  try {
    const doc = await task.promise
    if (stale()) return stop()
    const width = pageWidth(el)
    const pages: Page[] = []
    for (let number = 1; number <= doc.numPages; number++) {
      const pdf = await doc.getPage(number)
      if (stale()) return stop()
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
      if (stale()) return stop()
      pages.push({ number, pdf, viewport, content, box, marks, generation: 0 })
    }
    return { task, pages }
  } catch (error) {
    stop()
    throw error
  }
}

/** Pages within one screen of the scroll view are drawn; the pages in view are reported to `inView`. */
export function observePages(el: HTMLElement, pages: readonly Page[], near: (page: Page) => void, inView: (changes: readonly (readonly [Page, boolean])[]) => void): () => void {
  const byBox = (target: Element) => pages.find(p => p.box === target)
  const drawing = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const page = entry.isIntersecting ? byBox(entry.target) : undefined
      if (page) near(page)
    }
  }, { root: el, rootMargin: `${el.clientHeight || window.innerHeight}px 0px` })
  const viewing = new IntersectionObserver(entries => {
    inView(entries.flatMap(entry => { const page = byBox(entry.target); return page ? [[page, entry.isIntersecting] as const] : [] }))
  }, { root: el, rootMargin: '0px' })
  for (const page of pages) { drawing.observe(page.box); viewing.observe(page.box) }
  return () => { drawing.disconnect(); viewing.disconnect() }
}
