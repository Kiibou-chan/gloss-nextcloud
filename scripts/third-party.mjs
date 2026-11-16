import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const packages = new Map()

function gather(name, from) {
  const require = createRequire(join(from, 'package.json'))
  const folder = (require.resolve.paths(name) ?? []).map(base => join(base, name))
    .find(candidate => existsSync(join(candidate, 'package.json')))
  if (!folder) throw new Error(`Cannot find package metadata for ${name}`)
  const metadata = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'))
  const id = `${name}@${metadata.version}`
  if (packages.has(id)) return
  const licences = readdirSync(folder).filter(file => /^(?:licen[cs]e|copying)(?:[.-].*)?$/i.test(file)).sort()
  if (licences.length === 0) throw new Error(`Cannot find licence text for ${id}`)
  packages.set(id, { folder, metadata, licences })
  for (const dependency of Object.keys(metadata.dependencies ?? {}).sort()) gather(dependency, folder)
}

// These package families supply the page bundle and the PDF worker.
const roots = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
  .filter(name => /^(?:@codemirror\/|@lezer\/|@preact\/|preact$|pdfjs-dist$)/.test(name)).sort()
// The compiler package ships no licence file, so its texts come from the committed notices.
const compiler = '@myriaddreamin/typst-ts-web-compiler'
for (const name of roots) gather(name, root)

const sections = [
  '# Third-party licences',
  'The page and PDF worker bundle pdf.js, CodeMirror, Lezer, Preact, its signals, and their dependencies.\nThe Typst worker ships typst.ts\'s compiler, which embeds Typst, and the fonts of typst-assets.\nThese notices contain the installed packages\' complete licence texts.\nRegenerate them with `node scripts/third-party.mjs` after installing the locked dependencies.',
]
for (const [id, { folder, metadata, licences }] of [...packages.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  sections.push(`## ${id}\n\nLicence: ${metadata.license ?? 'See the licence text below'}.`)
  for (const file of licences) sections.push(`\`\`\`text\n${readFileSync(join(folder, file), 'utf8').trim()}\n\`\`\``)
}
const notice = file => readFileSync(join(root, 'notices', file), 'utf8').trim()
const compilerVersion = JSON.parse(readFileSync(join(root, 'node_modules', compiler, 'package.json'), 'utf8')).version
sections.push(
  `## ${compiler}@${compilerVersion}\n\nLicence: Apache-2.0.\nThe package ships no licence file; this is typst.ts's \`LICENSE\` at its tag v${compilerVersion}.`,
  `\`\`\`text\n${notice('typst-ts.LICENSE')}\n\`\`\``,
  '## Typst 0.14.2\n\nLicence: Apache-2.0.\nThe compiler\'s wasm embeds Typst; these are Typst\'s `LICENSE` and `NOTICE` at its tag v0.14.2.',
  `\`\`\`text\n${notice('typst.LICENSE')}\n\`\`\``,
  `\`\`\`text\n${notice('typst.NOTICE')}\n\`\`\``,
  '## typst-assets 0.15.1 fonts\n\nLicences: the SIL Open Font License 1.1 (Libertinus Serif), the GUST Font License (New Computer Modern), and the Bitstream Vera and Arev licences (DejaVu Sans Mono).\nThe 17 files in `fonts/` are from typst-assets v0.15.1; this is its `NOTICE`, also shipped as `fonts/NOTICE`.',
  `\`\`\`text\n${readFileSync(join(root, 'fonts', 'NOTICE'), 'utf8').trim()}\n\`\`\``,
)
writeFileSync(join(root, 'THIRD-PARTY.md'), `${sections.join('\n\n')}\n`)
