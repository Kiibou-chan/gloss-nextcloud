import { build } from 'esbuild'

await build({
  entryPoints: ['src/editor.mjs'],
  bundle: true,
  // Preserve the spike's output while the new strict TypeScript config is in place.
  tsconfigRaw: {},
  minify: true,
  format: 'iife',
  outfile: 'js/vendor/editor.bundle.js',
})
