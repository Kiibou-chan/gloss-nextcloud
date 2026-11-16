/** The compiler's worker, wasm, and font urls, beside the PDF worker's; each carries the app version so an update refetches it. */
export function typstUrls(pdfWorkerUrl: string, page: string, version: string): { workerUrl: string; wasmUrl: string; fontBase: string; suffix: string } {
  const suffix = `?v=${version}`
  const folder = new URL('.', new URL(pdfWorkerUrl, page))
  return {
    workerUrl: `${new URL('typst.worker.js', folder).href}${suffix}`,
    wasmUrl: `${new URL('typst-compiler.wasm', folder).href}${suffix}`,
    fontBase: new URL('../fonts/', folder).href,
    suffix,
  }
}
