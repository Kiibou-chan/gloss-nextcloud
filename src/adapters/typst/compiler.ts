import type { CompileJob, CompileResult, CompilerPort } from '../../app/ports'
import { FONT_FILES } from './fonts'
import type { CompilerMessage, WorkerAnswer } from './protocol'

export interface WorkerLike {
  postMessage(message: CompilerMessage, transfer?: Transferable[]): void
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
  addEventListener(type: 'error' | 'messageerror', listener: () => void): void
  terminate(): void
}

const moduleWorker = (url: string): WorkerLike => new Worker(url, { type: 'module' })

/** The worker, its wasm, and the fonts load on the first `compile`; each url carries `suffix` (the app version). */
export function createTypstCompiler(workerUrl: string, wasmUrl: string, fontBase: string, suffix: string, makeWorker: (url: string) => WorkerLike = moduleWorker): CompilerPort {
  let worker: WorkerLike | null = null
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
    const dead = () => { for (const done of waiting.values()) done({ failed: 'start' }); waiting.clear() }
    w.addEventListener('error', dead)
    w.addEventListener('messageerror', dead)
    w.postMessage({ type: 'init', wasmUrl, fontUrls: FONT_FILES.map(file => `${fontBase}${file}${suffix}`) })
    return w
  }

  return {
    compile(job: CompileJob): Promise<CompileResult> {
      worker ??= spawn()
      const id = next++
      return new Promise(resolve => {
        waiting.set(id, resolve)
        worker?.postMessage({ type: 'compile', id, job })
      })
    },
  }
}
