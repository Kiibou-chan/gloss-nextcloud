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
for (const name of roots) gather(name, root)

const sections = [
  '# Third-party licences',
  'The page and PDF worker bundle pdf.js, CodeMirror, Lezer, Preact, its signals, and their dependencies.\nThese notices contain the installed packages\' complete licence texts.\nRegenerate them with `node scripts/third-party.mjs` after installing the locked dependencies.',
]
for (const [id, { folder, metadata, licences }] of [...packages.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  sections.push(`## ${id}\n\nLicence: ${metadata.license ?? 'See the licence text below'}.`)
  for (const file of licences) sections.push(`\`\`\`text\n${readFileSync(join(folder, file), 'utf8').trim()}\n\`\`\``)
}
writeFileSync(join(root, 'THIRD-PARTY.md'), `${sections.join('\n\n')}\n`)
