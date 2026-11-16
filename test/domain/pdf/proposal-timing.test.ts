import { expect, test } from 'vitest';
import { pdfKey, sourceKey } from '../../../src/domain/pdf/match';
import { placeItem } from '../../../src/domain/pdf/proposal-marks';
import { plainOps } from '../../../src/domain/source/typst-parse';

// Five calibration runs of the first pass over 2,000 items, ms:
// 42.901; 43.315; 43.488; 42.863; 42.876 (317 before the window).
// Three times the worst sample; every sample is logged before its assertion.
const boundMs = 3 * 43.488;

test('first PDF pass: 2,000 proposals on 10,000 lines, 50 lines a page with a header and a page number', () => {
  const lines = Array.from({ length: 10000 }, (_, i) => `line${i} alpha beta gamma delta epsilon zeta theta\n`);
  const draft = lines.join('');
  const sk = sourceKey('a.txt', draft, plainOps(draft));
  const pages = Array.from({ length: 200 }, (_, p) => [
    'Running header',
    ...lines.slice(p * 50, p * 50 + 50).map(line => line.trimEnd()),
    String(p + 1),
  ]);
  const pk = pdfKey(pages);
  const places = Array.from(draft.matchAll(/alpha/g)).filter((_, i) => i % 5 === 0).map((m, i) => ({
    id: `p${i}`, from: m.index, to: m.index + 5, inserts: false,
  }));
  expect(places).toHaveLength(2000);
  const start = performance.now();
  let placed = 0;
  for (const item of places) if (placeItem(sk, pk, item, item.from / draft.length)) placed++;
  const elapsed = performance.now() - start;
  console.log(`first pass: ${elapsed.toFixed(3)} ms for ${placed} placed`);
  expect(placed).toBe(2000);
  expect(elapsed).toBeLessThan(boundMs);
});
