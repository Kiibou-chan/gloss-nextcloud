import type { CompileJob, CompileResult, CompilerPort } from '../../app/ports'
import { FONT_FILES } from './fonts'
import type { CompilerMessage, WorkerAnswer } from './protocol'

export interface WorkerLike {
  postMessage(message: CompilerMessage, transfer?: Transferable[]): void
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
  addEventListener(type: 'error' | 'messageerror', listener: () => void): void
  terminate(): void
}

/** A compile with no answer by then ends the worker; the next compile starts a new one. */
const COMPILE_DEADLINE_MS = 60_000
/** The first compile also downloads the wasm and the fonts inside the worker, so it gets this long until one has been answered. */
const COLD_DEADLINE_MS = 180_000

const moduleWorker = (url: string): WorkerLike => new Worker(url, { type: 'module' })

/** The worker, its wasm, and the fonts load on the first `compile`; each url carries `suffix` (the app version). */
export function createTypstCompiler(workerUrl: string, wasmUrl: string, fontBase: string, suffix: string, makeWorker: (url: string) => WorkerLike = moduleWorker, deadlineMs = COMPILE_DEADLINE_MS, coldDeadlineMs = COLD_DEADLINE_MS): CompilerPort {
  let worker: WorkerLike | null = null
  let warm = false
  let next = 1
  const waiting = new Map<number, (result: CompileResult) => void>()

  function spawn(): WorkerLike {
    const w = makeWorker(workerUrl)
    w.addEventListener('message', event => {
      const answer = event.data as WorkerAnswer
      const done = waiting.get(answer.id)
      if (!done) return
      waiting.delete(answer.id)
      done('failed' in answer ? { failed: 'start' } : { pdf: answer.pdf, diagnostics: answer.diagnostics, ms: answer.ms })
    })
    const dead = () => { if (worker === w) worker = null; for (const done of [...waiting.values()]) done({ failed: 'start' }); waiting.clear() }
    w.addEventListener('error', dead)
    w.addEventListener('messageerror', dead)
    w.postMessage({ type: 'init', wasmUrl, fontUrls: FONT_FILES.map(file => `${fontBase}${file}${suffix}`) })
    return w
  }

  return {
    compile(job: CompileJob): Promise<CompileResult> {
      try { worker ??= spawn() } catch { worker = null; return Promise.resolve({ failed: 'start' }) }
      const id = next++
      const own = worker
      return new Promise(resolve => {
        const timer = setTimeout(() => {
          if (worker === own) worker = null
          own.terminate()
          waiting.delete(id)
          resolve({ failed: 'start' })
        }, warm ? deadlineMs : coldDeadlineMs)
        waiting.set(id, result => { clearTimeout(timer); if (!('failed' in result)) warm = true; resolve(result) })
        own.postMessage({ type: 'compile', id, job })
      })
    },
  }
}
