import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

/** P1's synthetic vocabulary, with a fixed seed for reproducible timings. */
export function longDraft(lines = 10_000) {
  const words = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu'];
  let seed = 714;
  const word = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return words[seed % words.length];
  };
  return Array.from({ length: lines }, () => Array.from({ length: 10 }, word).join(' ')).join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = process.argv[2] ?? 'build/nc/Long/long.typ';
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, longDraft());
}
