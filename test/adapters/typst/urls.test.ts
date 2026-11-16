import { expect, test } from 'vitest'
import { typstUrls } from '../../../src/adapters/typst/urls'

test('derives the worker, wasm, and font urls from the PDF worker url and appends the version', () => {
  expect(typstUrls('/apps/gloss/js/pdf.worker.js?v=1', 'https://cloud.example/s/abc', '0.2.0')).toEqual({
    workerUrl: 'https://cloud.example/apps/gloss/js/typst.worker.js?v=0.2.0',
    wasmUrl: 'https://cloud.example/apps/gloss/js/typst-compiler.wasm?v=0.2.0',
    fontBase: 'https://cloud.example/apps/gloss/fonts/',
    suffix: '?v=0.2.0',
  })
})
