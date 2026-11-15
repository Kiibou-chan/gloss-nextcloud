import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';

function run(port) {
  const root = mkdtempSync(join(tmpdir(), 'gloss-dev-nc-test-'));
  try {
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'bin'));
    copyFileSync(resolve('scripts/dev-nc.sh'), join(root, 'scripts/dev-nc.sh'));
    // Stub Docker completely, including ownership checks, without creating fixture state.
    writeFileSync(join(root, 'bin/docker'), `#!/bin/bash
printf '%s\\n' "$*" >> "$PWD/docker.log"
if [[ "$1" = inspect && "$3" = *gloss.dev.root* ]]; then pwd
elif [[ "$1" = inspect ]]; then echo false
fi
`, { mode: 0o700 });
    const result = spawnSync('bash', [join(root, 'scripts/dev-nc.sh'), 'sync'], {
      env: { PATH: `${join(root, 'bin')}:${process.env.PATH}`, GLOSS_DEV_NC_PORT: port },
      encoding: 'utf8',
    });
    expect(result.error).toBeUndefined();
    return { ...result, docker: existsSync(join(root, 'docker.log')) ? readFileSync(join(root, 'docker.log'), 'utf8') : '' };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test.each(['08089', '8089', '0', '99999', 'abc', '08090', '18446744073709559706'])(
  'rejects invalid port %s before calling Docker', port => {
    const result = run(port);
    expect(result.status, result.stderr).toBe(2);
    expect(result.docker).toBe('');
    expect(result.stderr).not.toMatch(/value too great for base/);
  },
);

test('accepts plain decimal development port 8090 with a Docker stub', () => {
  const result = run('8090');
  expect(result.status, result.stderr).toBe(0);
  expect(result.docker).toContain('container inspect gloss-dev-nc');
});
