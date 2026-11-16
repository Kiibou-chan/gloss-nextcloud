import { expect, test } from 'vitest'
import { createProtocol, type CompilerLike, type CompilerMessage } from '../../../src/adapters/typst/protocol'

type Call = readonly [string, ...unknown[]]

function fakeCompiler(calls: Call[], outcome: () => unknown, withEvict = true, warnings: unknown[] = []): CompilerLike {
  const compiler: CompilerLike = {
    reset_shadow: () => { calls.push(['reset']) },
    add_source: (path, text) => { calls.push(['source', path, text]); return true },
    map_shadow: (path, bytes) => { calls.push(['file', path, bytes.length]); return true },
    compile: (main, inputs, fmt, diagnostics) => { calls.push(['compile', main, inputs, fmt, diagnostics]); return outcome() as ReturnType<CompilerLike['compile']> },
  }
  compiler.snapshot = (root, main) => {
    calls.push(['snapshot', root, main])
    return { compile: (kind, fmt) => { calls.push(['world', kind, fmt]); return { diagnostics: warnings as never } } }
  }
  if (withEvict) compiler.evict_cache = (age) => { calls.push(['evict', age]) }
  return compiler
}

const assets = { type: 'init', wasmUrl: 'w.wasm', fontUrls: ['f1', 'f2'] } as const
const job = (main: string, extra: Partial<{ sources: { path: string; text: string }[]; files: { path: string; bytes: Uint8Array }[] }> = {}) =>
  ({ type: 'compile', id: 1, job: { main, sources: [{ path: main, text: 'x' }], files: [], ...extra } }) satisfies CompilerMessage
const okPdf = () => ({ result: new Uint8Array([37, 80, 68, 70]) })

test('initialises once for two jobs', async () => {
  let starts = 0
  const calls: Call[] = []
  const p = createProtocol({ start: async () => { starts++; return fakeCompiler(calls, okPdf) }, now: () => 0 })
  await p.handle(assets)
  await p.handle(job('a.typ'))
  await p.handle({ ...job('a.typ'), id: 2 })
  expect(starts).toBe(1)
})

test('start receives the asset urls of the init message', async () => {
  let seen: unknown
  const p = createProtocol({ start: async a => { seen = a; return fakeCompiler([], okPdf) }, now: () => 0 })
  await p.handle(assets)
  await p.handle(job('a.typ'))
  expect(seen).toEqual({ wasmUrl: 'w.wasm', fontUrls: ['f1', 'f2'] })
})

test('maps sources and files under their own paths, compiles the main file to pdf, and evicts', async () => {
  const calls: Call[] = []
  const p = createProtocol({ start: async () => fakeCompiler(calls, okPdf), now: () => 0 })
  await p.handle(assets)
  const answer = await p.handle(job('draft.typ', {
    sources: [{ path: 'draft.typ', text: 'D' }, { path: 'main.typ', text: 'M' }],
    files: [{ path: 'refs.bib', bytes: new Uint8Array(3) }],
  }))
  expect(calls).toEqual([
    ['reset'], ['source', '/draft.typ', 'D'], ['source', '/main.typ', 'M'], ['file', '/refs.bib', 3],
    ['compile', '/draft.typ', undefined, 'pdf', 3], ['snapshot', '/', '/draft.typ'], ['world', 0, 3], ['evict', 30],
  ])
  expect(answer).toMatchObject({ id: 1, pdf: new Uint8Array([37, 80, 68, 70]), diagnostics: [] })
})

test('an older compiler without evict_cache is not asked to evict', async () => {
  const calls: Call[] = []
  const p = createProtocol({ start: async () => fakeCompiler(calls, okPdf, false), now: () => 0 })
  await p.handle(assets)
  await p.handle(job('a.typ'))
  expect(calls.some(c => c[0] === 'evict')).toBe(false)
})

test('measures ms with the clock it is given', async () => {
  const times = [10, 25]
  const p = createProtocol({ start: async () => fakeCompiler([], okPdf), now: () => times.shift() ?? 0 })
  await p.handle(assets)
  expect(await p.handle(job('a.typ'))).toMatchObject({ ms: 15 })
})

test('a thrown compile answers its diagnostics with one-based lines of the main file', async () => {
  const diagnostics = [
    { package: '', path: 'a.typ', severity: 'error', range: '1:5-1:6', message: 'unclosed delimiter' },
    { package: '', path: 'other.typ', severity: 'error', range: '3:0-3:1', message: 'in another file' },
    { package: '', path: 'a.typ', severity: 'warning', range: '0:0-0:4', message: 'unknown font family: x' },
  ]
  const p = createProtocol({ start: async () => fakeCompiler([], () => { throw diagnostics }), now: () => 0 })
  await p.handle(assets)
  expect(await p.handle(job('a.typ'))).toMatchObject({
    pdf: null,
    diagnostics: [
      { severity: 'error', message: 'unclosed delimiter', line: 2 },
      { severity: 'error', message: 'in another file', line: null },
      { severity: 'warning', message: 'unknown font family: x', line: 1 },
    ],
  })
})

test('a result without diagnostics keeps its pdf and takes its warnings from the snapshot world', async () => {
  const warn = { package: '', path: '/a.typ', severity: 'warning', range: '2:0-2:1', message: 'unknown font family: y' }
  const p = createProtocol({ start: async () => fakeCompiler([], () => ({ result: new Uint8Array(1) }), true, [warn]), now: () => 0 })
  await p.handle(assets)
  const answer = await p.handle(job('a.typ'))
  expect(answer).toMatchObject({ diagnostics: [{ severity: 'warning', line: 3 }] })
  expect((answer as { pdf: Uint8Array | null }).pdf).toHaveLength(1)
})

test('a returned error result (hasError) answers its diagnostics with no pdf and asks for no warnings', async () => {
  const calls: Call[] = []
  const error = { package: '', path: '/a.typ', severity: 'error', range: '1:0-1:1', message: 'unclosed delimiter' }
  const p = createProtocol({ start: async () => fakeCompiler(calls, () => ({ hasError: true, diagnostics: [error] })), now: () => 0 })
  await p.handle(assets)
  expect(await p.handle(job('a.typ'))).toMatchObject({ pdf: null, diagnostics: [{ severity: 'error', message: 'unclosed delimiter', line: 2 }] })
  expect(calls.some(c => c[0] === 'snapshot')).toBe(false)
})

test('a compiler without snapshot gives no warnings and no failure', async () => {
  const c = fakeCompiler([], okPdf)
  delete c.snapshot
  const p = createProtocol({ start: async () => c, now: () => 0 })
  await p.handle(assets)
  expect(await p.handle(job('a.typ'))).toMatchObject({ diagnostics: [] })
})

test('an error with no range or an unreadable thrown value gives line null', async () => {
  const p = createProtocol({ start: async () => fakeCompiler([], () => { throw new Error('boom') }), now: () => 0 })
  await p.handle(assets)
  expect(await p.handle(job('a.typ'))).toMatchObject({ pdf: null, diagnostics: [{ severity: 'error', message: 'boom', line: null }] })
})

test('a failed start answers failed start, also for later jobs', async () => {
  let starts = 0
  const p = createProtocol({ start: async () => { starts++; throw new Error('font fetch') }, now: () => 0 })
  await p.handle(assets)
  expect(await p.handle(job('a.typ'))).toEqual({ id: 1, failed: 'start', reason: 'font fetch' })
  expect(await p.handle({ ...job('a.typ'), id: 2 })).toEqual({ id: 2, failed: 'start', reason: 'font fetch' })
  expect(starts).toBe(1)
})
