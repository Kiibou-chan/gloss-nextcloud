import { build } from 'esbuild'
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { textLayerCss } from './text-layer-css.mjs'

const version = /<version>([^<]+)<\/version>/.exec(await readFile('appinfo/info.xml', 'utf8'))?.[1]
if (!version) throw new Error('appinfo/info.xml has no <version>')

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  minify: true,
  format: 'iife',
  outfile: 'js/gloss-review.js',
  define: { __APP_VERSION__: JSON.stringify(version) },
})

await build({
  entryPoints: ['src/adapters/pdfjs/worker-entry.ts'],
  bundle: true,
  minify: true,
  format: 'esm',
  outfile: 'js/pdf.worker.js',
})

// The compiler glue builds functions from strings that wasm hands it: the constant bodies of
// its dummy access model and package registry. Each call site becomes a lookup of those
// constants, which throws for any other body, so the bundle has no `new Function(`.
const EXPECTED_FUNCTION_SITES = 2
const functionTable = `const noRuntimeCode = (...parts) => {
  const body = parts[parts.length - 1];
  const args = parts.slice(0, -1).join(',');
  if (args === '' && body === 'return 0') return () => 0;
  if (args === '' && body === 'return true') return () => true;
  if (args === 'path' && body === 'return path') return path => path;
  const thrown = args === '' ? /^throw new Error\\('([^']*)'\\)$/.exec(body) : null;
  if (thrown) return () => { throw new Error(thrown[1]) };
  throw new Error('runtime code generation is not available: ' + body);
};
`
const noRuntimeCode = {
  name: 'no-runtime-code',
  setup(b) {
    b.onLoad({ filter: /typst_ts_web_compiler\.mjs$/ }, async ({ path }) => {
      const source = await readFile(path, 'utf8')
      const found = source.match(/\bnew Function\(/g)?.length ?? 0
      if (found !== EXPECTED_FUNCTION_SITES) throw new Error(`expected ${EXPECTED_FUNCTION_SITES} new Function sites in the compiler glue, found ${found}`)
      return { contents: functionTable + source.replaceAll('new Function(', 'noRuntimeCode('), loader: 'js' }
    })
  },
}

await build({
  entryPoints: ['src/adapters/typst/worker-entry.ts'],
  bundle: true,
  minify: true,
  format: 'esm',
  outfile: 'js/typst.worker.js',
  plugins: [noRuntimeCode],
})
await copyFile('node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm', 'js/typst-compiler.wasm')

await writeFile('css/pdf-text-layer.css', textLayerCss(
  await readFile('node_modules/pdfjs-dist/web/pdf_viewer.css', 'utf8'),
))
