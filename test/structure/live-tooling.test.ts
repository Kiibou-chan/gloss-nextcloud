import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { expect, test } from 'vitest'

function probe(args: string[]) {
  const root = mkdtempSync(join(tmpdir(), 'gloss-live-'))
  try {
    mkdirSync(join(root, 'scripts'))
    mkdirSync(join(root, 'bin'))
    copyFileSync('scripts/dev-nc.sh', join(root, 'scripts/dev-nc.sh'))
    writeFileSync(join(root, 'bin/docker'), `#!/bin/bash
printf '%s\\n' "$*" >> "$PWD/docker.log"
if [[ "$1" = inspect && "$3" = *gloss.dev.root* ]]; then pwd
elif [[ "$1" = inspect ]]; then echo true
elif [[ "$1" = exec && "$2" = -i ]]; then cat > "$PWD/input.tar.gz"
fi
`, { mode: 0o700 })
    writeFileSync(join(root, 'archive.tar.gz'), 'synthetic archive stream')
    const result = spawnSync('bash', [join(root, 'scripts/dev-nc.sh'), ...args], { cwd: root, env: { PATH: `${join(root, 'bin')}:${process.env.PATH}` }, encoding: 'utf8' })
    return { status: result.status, log: readFileSync(join(root, 'docker.log'), 'utf8'), input: args[0] === 'install-archive' && result.status === 0 ? readFileSync(join(root, 'input.tar.gz'), 'utf8') : '' }
  } finally { rmSync(root, { recursive: true, force: true }) }
}

test('archive installs stream bytes, chown, disable, and enable in order', () => {
  const result = probe(['install-archive', 'archive.tar.gz'])
  expect(result.status).toBe(0)
  expect(result.input).toBe('synthetic archive stream')
  expect(result.log).toContain('tar -xzf -')
  expect(result.log.indexOf('chown -R')).toBeLessThan(result.log.indexOf('app:disable gloss'))
  expect(result.log.indexOf('app:disable gloss')).toBeLessThan(result.log.indexOf('app:enable gloss'))
})

test('debug false uses a boolean occ setting', () => {
  const result = probe(['debug', 'false'])
  expect(result.status).toBe(0)
  expect(result.log).toContain('config:system:set debug --value=false --type=boolean')
})

test('copy and foreign reset overrides are explicit and reset-only', () => {
  const source = readFileSync(resolve('scripts/dev-nc.sh'), 'utf8')
  expect(source).toContain('GLOSS_DEV_NC_COPY')
  expect(source).toContain('GLOSS_DEV_NC_FORCE_RESET')
  expect(source).toContain('reset) down "${GLOSS_DEV_NC_FORCE_RESET:-0}"; up;;')
  expect(source).toContain('down) down;;')
})

test('unplaced evidence extracts the requested raw object after an overall item', async () => {
  const modulePath = '../../scripts/shots/live.mjs'
  const { rawItem } = await import(modulePath) as { rawItem(text: string, id: string): string }
  const raw = '{ "id": "quote", "quote": { "exact": "a } and \\\"b\\\"" }, "comments": [] }'
  const text = `{ "items": [{"id":"overall","text":"synthetic"}, ${raw}] }`
  expect(rawItem(text, 'quote')).toBe(raw)
  expect(() => rawItem(text, 'missing')).toThrow('Review item missing.')
})
