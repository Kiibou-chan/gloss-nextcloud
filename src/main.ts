import { restoreAuthFragment } from './adapters/browser/auth-fragment'
import { createCommentDraftStore } from './adapters/storage/comment-draft-store'
import { ReviewSession } from './app/session'
import { createEditor } from './adapters/codemirror/editor'
import { createPdfView } from './adapters/pdfjs/pdf-view'
import { createReviewApi } from './adapters/http/review-api'
import { createBrowserStore } from './adapters/storage/browser-store'
import { browserClock } from './adapters/browser/clock'
import { browserIds } from './adapters/browser/ids'
import { browserScheduler } from './adapters/browser/scheduler'
import { browserClipboard } from './adapters/browser/clipboard'
import { languageOf, spellLanguage } from './domain/source/language'
import { createPanelModel } from './ui/panel-model'
import { mountHead, mountPanel } from './ui/mount'

export async function mountReview(root: HTMLElement): Promise<() => void> {
  restoreAuthFragment(root.dataset.fragmentScope ?? '')
  const slot = (selector: string) => {
    const el = root.querySelector<HTMLElement>(selector)
    if (!el) throw new Error(`Missing review slot: ${selector}`)
    return el
  }
  const header = slot('.gr-head'), side = slot('.gr-side'), text = slot('#gr-text'), pdfSlot = slot('#gr-pdf')
  const requestToken = (globalThis as typeof globalThis & { OC?: { requestToken?: string } }).OC?.requestToken
    ?? document.head.dataset.requesttoken ?? ''
  const base = (root.dataset.base ?? location.pathname).replace(/\/$/, '')
  const api = createReviewApi(base, requestToken, root.dataset.csrfTokenUrl, root.dataset.passwordProtected === '1')
  const footer = document.querySelector('footer')
  const measureFooter = () => {
    root.style.setProperty('--gr-footer-height', `${footer ? Math.max(0, innerHeight - footer.getBoundingClientRect().top) : 0}px`)
    root.style.setProperty('--gr-panel-top', `${Math.max(60, side.getBoundingClientRect().top)}px`)
  }
  const footerObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureFooter)
  if (footer) footerObserver?.observe(footer)
  footerObserver?.observe(header)
  window.addEventListener('resize', measureFooter)
  window.addEventListener('scroll', measureFooter, true)
  measureFooter()
  const draft = await api.draft(), main = draft.files.find(file => file.file === draft.main)
  if (!main) throw new Error('The draft could not be found.')
  const language = languageOf(main.file)
  const editor = createEditor(text, { text: main.text, language, spellLanguage: spellLanguage(main.text) ?? 'en' })
  const pdf = createPdfView(pdfSlot, { url: `${base}/pdf`, workerUrl: root.dataset.worker ?? '' })
  const model = createPanelModel()
  const session = new ReviewSession({
    editor, pdf, api, panel: model, draftStore: createCommentDraftStore(root.dataset.token ?? ''),
    store: createBrowserStore(root.dataset.token ?? ''), clock: browserClock,
    ids: browserIds, scheduler: browserScheduler, clipboard: browserClipboard,
    reviewable: root.dataset.reviewable === '1', hasPdf: root.dataset.hasPdf === '1',
    diagnostic: message => console.warn(message),
  }, { address: location.href, fragment: location.hash }, { ...main, language })
  const unmountHead = mountHead(header, model, session)
  const unmountPanel = mountPanel(side, model, session)
  const unsubscribe = model.head.subscribe(view => {
    root.dataset.view = view.view
    text.hidden = view.view === 'pdf'
    pdfSlot.hidden = view.view === 'editor'
  })
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('beforeunload', onBeforeUnload)
    window.removeEventListener('online', onOnline)
    footerObserver?.disconnect()
    window.removeEventListener('resize', measureFooter)
    window.removeEventListener('scroll', measureFooter, true)
    session.dispose(); unsubscribe(); unmountPanel(); unmountHead()
    editor.dispose?.(); pdf.dispose?.()
  }
  const onPageHide = (event: PageTransitionEvent) => { session.pagehide(); if (!event.persisted) dispose() }
  const onBeforeUnload = (event: BeforeUnloadEvent) => { if (session.dirty) { event.preventDefault(); event.returnValue = '' } }
  const onOnline = () => session.online()
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('online', onOnline)
  await session.start()
  return dispose
}

const root = document.querySelector<HTMLElement>('#gloss-review')
if (root) void mountReview(root).catch(error => {
  console.error('Could not load the draft.', error)
  const header = root.querySelector('.gr-head')
  if (header && !header.querySelector('#gr-status')) header.textContent = 'Could not load the draft.'
})
