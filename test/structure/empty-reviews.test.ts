import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from 'vitest'

function cleanup(base: string, href = '/remote.php/dav/files/gloss-owner/Review%20reviews/ada.json') {
  const root = mkdtempSync(join(tmpdir(), 'gloss-clean-reviews-'))
  try {
    mkdirSync(join(root, 'scripts'))
    mkdirSync(join(root, 'bin'))
    copyFileSync('scripts/dev-nc.sh', join(root, 'scripts/dev-nc.sh'))
    writeFileSync(join(root, '.dev-nc.env'), JSON.stringify({ base, owner: 'gloss-owner', password: 'synthetic-private' }), { mode: 0o600 })
    writeFileSync(join(root, 'bin/curl'), `#!/bin/bash
printf '%s\\n' "$*" >> "$PWD/curl.log"
cat >/dev/null
if [[ "$*" = *PROPFIND* ]]; then
cat <<'XML'
<d:multistatus xmlns:d="DAV:"><d:response><d:href>/remote.php/dav/files/gloss-owner/Review%20reviews/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response><d:response><d:href>${href}</d:href><d:propstat><d:prop><d:resourcetype/></d:prop></d:propstat></d:response><d:response><d:href>/remote.php/dav/files/gloss-owner/Review%20reviews/keep/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response></d:multistatus>
XML
printf '\\n207'
fi
`, { mode: 0o700 })
    const result = spawnSync('bash', [join(root, 'scripts/dev-nc.sh'), 'empty-reviews'], { cwd: resolve('.'), env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}` }, encoding: 'utf8' })
    return { ...result, requests: existsSync(join(root, 'curl.log')) ? readFileSync(join(root, 'curl.log'), 'utf8') : '' }
  } finally { rmSync(root, { recursive: true, force: true }) }
}

test('empty-reviews deletes only direct files through the disposable WebDAV endpoint', () => {
  const result = cleanup('http://127.0.0.1:8090')
  expect(result.status, result.stderr).toBe(0)
  expect(result.requests).toContain('PROPFIND')
  const deletes = result.requests.split('\n').filter(line => line.includes('DELETE'))
  expect(deletes).toHaveLength(1)
  expect(deletes[0]).toContain('http://127.0.0.1:8090/remote.php/dav/files/gloss-owner/Review%20reviews/ada.json')
  expect(result.requests + result.stdout + result.stderr).not.toContain('synthetic-private')
})

test.each(['http://127.0.0.1:8089', 'http://example.invalid:8090', 'http://127.0.0.1:8091'])('empty-reviews refuses %s before making requests', base => {
  const result = cleanup(base)
  expect(result.status).not.toBe(0)
  expect(result.requests).toBe('')
})

test('empty-reviews refuses a response escaping its fixed folder', () => {
  const result = cleanup('http://127.0.0.1:8090', '/remote.php/dav/files/gloss-owner/other.json')
  expect(result.status).not.toBe(0)
  expect(result.requests).not.toContain('DELETE')
})
