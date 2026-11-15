import { vi } from 'vitest'
import type { Backup, Change, Ports, EditorPort, PdfPort, ReviewApi, BackupStore, Clock, Ids, Scheduler, PanelPort, Clipboard, Failure } from '../../src/app/ports'
import type { HeadView } from '../../src/app/view'

export function fakes() {
  let text = '', key: string | null = null, view: 'editor' | 'pdf' | 'both' | null = null, sequence = 0
  let edit: (c: readonly Change[]) => void = () => {}, select: (r: { from: number; to: number }) => void = () => {}
  let pdfSelect: (s: { text: string; fraction: number }) => void = () => {}
  let attempt = () => {}
  let unsubscriptions = 0
  let time = 0
  const timers: { at: number; run: () => void; cancelled: boolean }[] = []
  const backups = new Map<string, Backup>()
  const panel = {
    upsertCard: vi.fn<PanelPort['upsertCard']>(), removeCard: vi.fn<PanelPort['removeCard']>(), setOrder: vi.fn<PanelPort['setOrder']>(), setCount: vi.fn<PanelPort['setCount']>(), setHead: vi.fn<(h: HeadView) => void>(),
    setUnplaced: vi.fn(), focusName: vi.fn(), setLink: vi.fn(), setOverallView: vi.fn(), setConflictView: vi.fn(),
  } satisfies PanelPort
  const editor = {
    setText: vi.fn((s: string) => { text = s }), text: vi.fn(() => text),
    replace: vi.fn((c: Change) => { text = text.slice(0, c.from) + c.insert + text.slice(c.to); edit([c]) }),
    setMarks: vi.fn<EditorPort['setMarks']>(), setEditable: vi.fn(), scrollTo: vi.fn(),
    onAttempt: (fn: () => void) => { attempt = fn },
    onEdit: (fn: typeof edit) => { edit = fn; return () => { unsubscriptions++; edit = () => {} } }, onSelect: (fn: typeof select) => { select = fn; return () => { unsubscriptions++; select = () => {} } },
  } satisfies EditorPort
  const pdf = { show: vi.fn(async () => ({ pages: [['alpha beta gamma delta']] })), setMarks: vi.fn<PdfPort['setMarks']>(), scrollToMark: vi.fn(), onSelect: (fn: typeof pdfSelect) => { pdfSelect = fn; return () => { unsubscriptions++; pdfSelect = () => {} } } } satisfies PdfPort
  const failure: Failure = { status: 0, error: 'network' }
  const api = { draft: vi.fn(async () => ({ main: 'draft.txt', files: [{ file: 'draft.txt', text: 'alpha beta gamma delta', etag: 'v1' }] })), open: vi.fn<Ports['api']['open']>(async () => ({ review: null })), save: vi.fn<Ports['api']['save']>(async (_key, _body, base) => ({ revision: base + 1 })) } satisfies ReviewApi
  const store = { rememberedKey: () => key, remember: vi.fn((k: string) => { key = k }), read: (k: string) => backups.get(k) ?? null, write: (k: string, b: Backup) => { backups.set(k, b); return true }, keepConflict: vi.fn(), readConflict: () => null, view: () => view, setView: vi.fn((v: 'editor' | 'pdf' | 'both') => { view = v }) } satisfies BackupStore
  const clock = { now: () => '2026-11-15T20:00:00.000Z', local: (at: string) => at } satisfies Clock
  const ids = { item: () => (++sequence).toString().padStart(10, '0'), key: () => 'Abcdef1234567890' } satisfies Ids
  const scheduler = { after: (ms: number, run: () => void) => { const t = { at: time + ms, run, cancelled: false }; timers.push(t); return () => { t.cancelled = true } } } satisfies Scheduler
  const clipboard = { write: vi.fn(async () => true) } satisfies Clipboard
  const drafts = new Map<string, string>()
  const draftStore = { read: (key: string) => drafts.get(key) ?? null, write: (key: string, value: string) => { drafts.set(key, value) }, clear: (key: string) => { drafts.delete(key) } }
  const ports = { draftStore, editor, pdf, api, store, clock, ids, scheduler, clipboard, panel, reviewable: true, hasPdf: true, diagnostic: vi.fn<(message: string) => void>() } satisfies Ports
  return { ...ports, ports, attempt: () => attempt(), failure, unsubscribed: () => unsubscriptions, select: (from: number, to: number) => select({ from, to }), pdfSelect: (text: string, fraction = 0) => pdfSelect({ text, fraction }), drift: (s: string) => { text = s }, head: () => panel.setHead.mock.lastCall![0], advance: async (ms: number) => { const end = time + ms; for (;;) { const t = timers.filter(t => !t.cancelled && t.at <= end).sort((a, b) => a.at - b.at)[0]; if (!t) break; t.cancelled = true; time = t.at; t.run(); await Promise.resolve(); await Promise.resolve() } time = end } }
}
