import { importsPackage, typstReads } from '../domain/typst/reads'
import type { CompileJob, ReviewApi } from './ports'

const MAX_FILES = 64
export type Inputs = 'package' | 'file' | Pick<CompileJob, 'sources' | 'files'>

/** The files a Typst draft reads, found through its `.typ` files and fetched once each; a package import is found before any fetch. */
export class CompileInputs {
  private fetched = new Map<string, { bytes: Uint8Array; text: string | null }>()
  constructor(private readonly api: Pick<ReviewApi, 'file'>) {}
  async gather(main: string, text: string): Promise<Inputs> {
    if (importsPackage(text)) return 'package'
    const queue = typstReads(main, text), seen = new Set(queue)
    const sources: CompileJob['sources'][number][] = [], files: CompileJob['files'][number][] = []
    for (let i = 0; i < queue.length; i++) {
      if (i >= MAX_FILES) return 'file'
      const path = queue[i]!
      const got = this.fetched.get(path) ?? await this.api.file(path).catch(() => null)
      if (!got) return 'file'
      this.fetched.set(path, got)
      if (!path.endsWith('.typ')) { files.push({ path, bytes: got.bytes }); continue }
      if (got.text === null) return 'file'
      if (importsPackage(got.text)) return 'package'
      sources.push({ path, text: got.text })
      for (const next of typstReads(path, got.text)) if (!seen.has(next)) { seen.add(next); queue.push(next) }
    }
    return { sources, files }
  }
}
