import type { Diagnostic } from '../../domain/typst/diagnostic'
import type { CompileJob } from '../../app/ports'

export type Assets = { wasmUrl: string; fontUrls: readonly string[] }
export type CompilerMessage =
  | ({ type: 'init' } & Assets)
  | { type: 'compile'; id: number; job: CompileJob }
export type WorkerAnswer =
  | { id: number; pdf: Uint8Array | null; diagnostics: readonly Diagnostic[]; ms: number }
  | { id: number; failed: 'start'; reason: string }

type RawDiagnostic = { path?: unknown; severity?: unknown; range?: unknown; message?: unknown }
export interface CompilerLike {
  reset_shadow(): void
  add_source(path: string, text: string): boolean
  map_shadow(path: string, bytes: Uint8Array): boolean
  compile(main: string, inputs: undefined, fmt: 'pdf', diagnostics: 3): { result?: Uint8Array; hasError?: boolean; diagnostics?: readonly RawDiagnostic[] }
  snapshot?(root: string, main: string, inputs?: undefined): { compile(kind: 0, diagnostics: 3): { diagnostics?: readonly RawDiagnostic[] } }
  evict_cache?(maxAge: number): void
}
export type ProtocolDeps = { start(assets: Assets): Promise<CompilerLike>; now(): number }

const EVICT_AGE = 30

function lineOf(raw: RawDiagnostic, main: string): number | null {
  if (typeof raw.range !== 'string') return null
  const path = typeof raw.path === 'string' ? raw.path.replace(/^\//, '') : main
  if (path !== main) return null
  const zeroBased = /^(\d+):/.exec(raw.range)?.[1]
  return zeroBased === undefined ? null : Number(zeroBased) + 1
}

function convert(raws: readonly RawDiagnostic[], main: string): Diagnostic[] {
  return raws.map(raw => ({
    severity: raw.severity === 'warning' ? 'warning' : 'error',
    message: String(raw.message ?? ''),
    line: lineOf(raw, main),
  }))
}

/** A successful compile carries no diagnostics, so its warnings come from compiling the snapshot world, which the caches make cheap. */
function warningsOf(engine: CompilerLike, main: string, compiled: boolean): readonly RawDiagnostic[] {
  if (!compiled || !engine.snapshot) return []
  try { return engine.snapshot('/', `/${main}`).compile(0, 3).diagnostics ?? [] } catch { return [] }
}

function thrown(error: unknown, main: string): Diagnostic[] {
  if (Array.isArray(error)) return convert(error as RawDiagnostic[], main)
  const message = error instanceof Error ? error.message : String(error)
  return [{ severity: 'error', message, line: null }]
}

export function createProtocol(deps: ProtocolDeps) {
  let assets: Assets | null = null
  let started: Promise<CompilerLike> | null = null
  const compiler = () => started ??= deps.start(assets as Assets)

  async function compile(id: number, job: CompileJob): Promise<WorkerAnswer> {
    let engine: CompilerLike
    try { engine = await compiler() } catch (error) { return { id, failed: 'start', reason: error instanceof Error ? error.message : String(error) } }
    const t0 = deps.now()
    let pdf: Uint8Array | null = null
    let diagnostics: Diagnostic[]
    try {
      engine.reset_shadow()
      for (const s of job.sources) engine.add_source(`/${s.path}`, s.text)
      for (const f of job.files) engine.map_shadow(`/${f.path}`, f.bytes)
      const out = engine.compile(`/${job.main}`, undefined, 'pdf', 3)
      pdf = out.hasError ? null : out.result ?? null
      diagnostics = convert(out.diagnostics ?? warningsOf(engine, job.main, pdf !== null), job.main)
    } catch (error) {
      diagnostics = thrown(error, job.main)
    }
    engine.evict_cache?.(EVICT_AGE)
    return { id, pdf, diagnostics, ms: deps.now() - t0 }
  }

  return {
    async handle(message: CompilerMessage): Promise<WorkerAnswer | undefined> {
      if (message.type === 'init') { assets = { wasmUrl: message.wasmUrl, fontUrls: message.fontUrls }; return undefined }
      return compile(message.id, message.job)
    },
  }
}
