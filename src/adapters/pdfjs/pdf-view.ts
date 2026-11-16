import { isCommentShortcut } from '../browser/comment-shortcut'
import { GlobalWorkerOptions, TextLayer } from 'pdfjs-dist'
import type { getDocument } from 'pdfjs-dist'
import type { PdfMark, PdfPort } from '../../app/ports'
import { openDoc, observePages, type DocSource, type Page } from './pdf-doc'
import { drawPageMarks } from './mark-draw'
import { fontLookup } from './font-style'
import { createUndrawnTracker } from './undrawn'
const PAGE_GAP = 12
/** The host is the PDF scroll container; matching uses cached text, never the DOM. */
export function createPdfView(el: HTMLElement, { url, workerUrl }: { url: string; workerUrl: string }): PdfPort {
  let disposed = false, task: ReturnType<typeof getDocument> | undefined
  let loading: ReturnType<PdfPort['show']> | undefined
  let pages: Page[] = []
  let byId = new Map<string, PdfMark>(), byPage = new Map<number, PdfMark[]>()
  let look: Parameters<PdfPort['setLook']>[0] = 'changes'
  let stopObserving: (() => void) | undefined, epoch = 0
  const visible = new Set<number>()
  let selected: Parameters<PdfPort['onSelect']>[0] | undefined
  const undrawn = createUndrawnTracker(() => pages)
  function drawMarks(page: Page) { undrawn.set(page.number, drawPageMarks({ ...page, fontOf: fontLookup(page) }, byPage.get(page.number) ?? [], look)) }
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
    undrawn.forget(page.number)
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
  function visiblePages(next: readonly Page[], top: number) {
    const bottom = top + (el.clientHeight || window.innerHeight)
    let y = parseFloat(getComputedStyle(el).paddingTop) || 0
    return next.filter(page => {
      const start = y
      y += page.viewport.height + PAGE_GAP
      return y - PAGE_GAP > top && start < bottom
    })
  }
  async function load(source: DocSource, keep: boolean): ReturnType<PdfPort['show']> {
    GlobalWorkerOptions.workerSrc = workerUrl
    const mine = ++epoch
    const opened = await openDoc(el, source, () => disposed || epoch !== mine)
    if (!opened) return { pages: [] }
    const top = el.scrollTop
    const drawn = keep ? visiblePages(opened.pages, top) : []
    await Promise.all(drawn.map(page => draw(page).catch(error => console.error('Could not draw PDF page', error))))
    if (disposed || epoch !== mine) {
      for (const page of opened.pages) release(page)
      void opened.task.destroy().catch(error => console.error('Could not destroy PDF document', error))
      return { pages: [] }
    }
    const old = pages
    stopObserving?.(); visible.clear()
    destroyTask()
    task = opened.task
    pages = opened.pages
    el.replaceChildren(...pages.map(page => page.box))
    el.scrollTop = Math.min(top, Math.max(0, el.scrollHeight - el.clientHeight))
    for (const page of old) { release(page); undrawn.forget(page.number) }
    for (const page of drawn) if (page.canvas) drawMarks(page)
    stopObserving = observePages(el, pages, page => void draw(page).catch(error => console.error('Could not draw PDF page', error)), changes => {
      for (const [page, on] of changes) { if (on) visible.add(page.number); else visible.delete(page.number) }
      releaseDistant()
    })
    return { pages: pages.map(page => page.content.items.flatMap(item => 'str' in item ? [item.str] : [])) }
  }
  function destroyTask() {
    const current = task; task = undefined
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
  el.addEventListener('mouseup', reportSelection); el.addEventListener('keydown', commentKey)
  return {
    commentSelection: reportSelection,
    show() {
      if (disposed) return Promise.resolve({ pages: [] })
      loading ??= load({ url }, false).catch(error => {
        loading = undefined
        if (disposed) return { pages: [] }
        throw error
      })
      return loading
    },
    showBytes(bytes) {
      if (disposed) return Promise.resolve({ pages: [] })
      loading = undefined
      return load({ data: bytes }, true)
    },
    setMarks(next) {
      byId = new Map()
      byPage = new Map()
      for (const mark of next) {
        if (!byId.has(mark.id)) byId.set(mark.id, mark)
        const list = byPage.get(mark.page)
        if (list) list.push(mark)
        else byPage.set(mark.page, [mark])
      }
      for (const page of pages) drawMarks(page)
    },
    setLook(next) { look = next; for (const page of pages) drawMarks(page) },
    scrollToMark(id) {
      const mark = byId.get(id)
      const page = mark && pages[mark.page - 1]
      if (!page) return
      const drawn = [...page.marks.children].find(child => (child as HTMLElement).dataset.id === id)
      ;(drawn ?? page.box).scrollIntoView({ block: 'center', behavior: 'smooth' })
    },
    dispose() {
      if (disposed) return
      disposed = true
      destroyTask()
      stopObserving?.()
      el.removeEventListener('mouseup', reportSelection); el.removeEventListener('keydown', commentKey)
      selected = undefined
      for (const page of pages) release(page)
    },
    onUndrawn: undrawn.listen,
    onSelect(listener) { selected = listener; return () => { if (selected === listener) selected = undefined } },
  }
}
