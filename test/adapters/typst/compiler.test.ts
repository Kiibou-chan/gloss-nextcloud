import { expect, test, vi } from 'vitest'
import { createTypstCompiler, type WorkerLike } from '../../../src/adapters/typst/compiler'
import { FONT_FILES } from '../../../src/adapters/typst/fonts'

function fakeWorld() {
  const made: string[] = []
  const posted: unknown[][] = []
  let listener: ((e: { data: unknown }) => void) | null = null
  const worker: WorkerLike = {
    postMessage: (message, transfer) => {
      posted.push([message, transfer])
      const m = message as { type: string; id?: number }
      if (m.type === 'compile') queueMicrotask(() => listener?.({ data: { id: m.id, pdf: new Uint8Array([1]), diagnostics: [], ms: 5 } }))
    },
    addEventListener: (type: string, l: unknown) => { if (type === 'message') listener = l as typeof listener },
    terminate: () => {},
  }
  return { made, posted, makeWorker: (url: string) => { made.push(url); return worker } }
}

const job = { main: 'a.typ', sources: [{ path: 'a.typ', text: 'x' }], files: [] }

test('creates no worker until the first compile', async () => {
  const w = fakeWorld()
  const port = createTypstCompiler('js/typst.worker.js?v=1', 'js/typst-compiler.wasm?v=1', '../fonts/', '?v=1', w.makeWorker)
  expect(w.made).toEqual([])
  await port.compile(job)
  await port.compile(job)
  expect(w.made).toEqual(['js/typst.worker.js?v=1'])
})

test('the first message hands the worker the wasm and one url per font', async () => {
  const w = fakeWorld()
  const port = createTypstCompiler('w.js', 'c.wasm?v=1', 'fonts/', '?v=1', w.makeWorker)
  await port.compile(job)
  expect(w.posted[0]?.[0]).toEqual({ type: 'init', wasmUrl: 'c.wasm?v=1', fontUrls: FONT_FILES.map(f => `fonts/${f}?v=1`) })
})

test('answers the worker result by id', async () => {
  const w = fakeWorld()
  const port = createTypstCompiler('w.js', 'c.wasm', 'fonts/', '', w.makeWorker)
  expect(await port.compile(job)).toEqual({ pdf: new Uint8Array([1]), diagnostics: [], ms: 5 })
})

test('a failed start is passed on', async () => {
  const failing: WorkerLike = {
    postMessage: message => { const m = message as { type: string; id?: number }; if (m.type === 'compile') queueMicrotask(() => listeners.forEach(l => l({ data: { id: m.id, failed: 'start' } }))) },
    addEventListener: (_t, l) => { listeners.push(l) },
    terminate: () => {},
  }
  const listeners: ((e: { data: unknown }) => void)[] = []
  const port = createTypstCompiler('w.js', 'c.wasm', 'fonts/', '', () => failing)
  expect(await port.compile(job)).toEqual({ failed: 'start' })
})

test('a worker that errors answers failed start', async () => {
  let errorHandler: (() => void) | null = null
  const dead: WorkerLike = {
    postMessage: () => { queueMicrotask(() => errorHandler?.()) },
    addEventListener: (type, l) => { if (type === 'error') errorHandler = l as () => void },
    terminate: () => {},
  }
  const port = createTypstCompiler('w.js', 'c.wasm', 'fonts/', '', () => dead)
  expect(await port.compile(job)).toEqual({ failed: 'start' })
})

test('a compile the worker never answers fails start at the deadline, ends the worker, and the next compile spawns a new one', async () => {
  vi.useFakeTimers()
  try {
    let terminated = 0
    const made: number[] = []
    const silent = (): WorkerLike => ({ postMessage: () => {}, addEventListener: () => {}, terminate: () => { terminated++ } })
    const port = createTypstCompiler('w.js', 'c.wasm', 'fonts/', '', () => { made.push(1); return silent() }, 1000, 1000)
    const first = port.compile(job)
    await vi.advanceTimersByTimeAsync(999)
    expect(terminated).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(await first).toEqual({ failed: 'start' })
    expect(terminated).toBe(1)
    void port.compile(job)
    expect(made).toHaveLength(2)
  } finally { vi.useRealTimers() }
})

test('an answered compile leaves no deadline running', async () => {
  vi.useFakeTimers()
  try {
    const w = fakeWorld()
    const port = createTypstCompiler('w.js', 'c.wasm', 'fonts/', '', w.makeWorker, 1000, 1000)
    await port.compile(job)
    expect(vi.getTimerCount()).toBe(0)
  } finally { vi.useRealTimers() }
})

test('a worker that cannot be constructed answers failed start and the next compile tries again', async () => {
  let tries = 0
  const port = createTypstCompiler('w.js', 'c.wasm', 'fonts/', '', () => { tries++; throw new Error('SecurityError') })
  expect(await port.compile(job)).toEqual({ failed: 'start' })
  expect(await port.compile(job)).toEqual({ failed: 'start' })
  expect(tries).toBe(2)
})

test('the first compile gets the cold deadline, later ones the plain deadline', async () => {
  vi.useFakeTimers()
  try {
    let answer: ((e: { data: unknown }) => void) | null = null, id = 0
    const slow: WorkerLike = {
      postMessage: m => { const x = m as { type: string; id?: number }; if (x.type === 'compile') id = x.id! },
      addEventListener: (t, l) => { if (t === 'message') answer = l as typeof answer },
      terminate: () => {},
    }
    const port = createTypstCompiler('w.js', 'c.wasm', 'fonts/', '', () => slow, 1000, 3000)
    let first: unknown = 'pending'
    void port.compile(job).then(r => { first = r })
    await vi.advanceTimersByTimeAsync(2999)
    expect(first).toBe('pending')
    answer!({ data: { id, pdf: new Uint8Array([1]), diagnostics: [], ms: 1 } })
    await vi.advanceTimersByTimeAsync(0)
    expect(first).toEqual({ pdf: new Uint8Array([1]), diagnostics: [], ms: 1 })
    let second: unknown = 'pending'
    void port.compile(job).then(r => { second = r })
    await vi.advanceTimersByTimeAsync(1000)
    expect(second).toEqual({ failed: 'start' })
  } finally { vi.useRealTimers() }
})
