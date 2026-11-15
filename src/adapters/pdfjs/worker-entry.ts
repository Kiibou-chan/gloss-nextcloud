// pdfjs-dist ships this worker module without a declaration file.
// @ts-expect-error The exported handler also supports pdf.js's worker fallback.
export { WorkerMessageHandler } from 'pdfjs-dist/build/pdf.worker.mjs'
