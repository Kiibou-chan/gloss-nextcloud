import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import { textLayerCss } from './text-layer-css.mjs'

await build({
  entryPoints: ['src/editor.mjs'],
  bundle: true,
  // Preserve the spike's output while the new strict TypeScript config is in place.
  tsconfigRaw: {},
  minify: true,
  format: 'iife',
  outfile: 'js/vendor/editor.bundle.js',
})

await build({
  entryPoints: ['src/adapters/pdfjs/worker-entry.ts'],
  bundle: true,
  minify: true,
  format: 'esm',
  outfile: 'js/pdf.worker.js',
})

await writeFile('css/pdf-text-layer.css', textLayerCss(
  await readFile('node_modules/pdfjs-dist/web/pdf_viewer.css', 'utf8'),
))
