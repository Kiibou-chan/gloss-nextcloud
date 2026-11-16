import { expect, it } from 'vitest';
import { backgroundOf, ringOf } from '../../../src/adapters/pdfjs/background';

const px = (hex: string, n: number) => {
  const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return Array.from({ length: n }, () => [...v, 255]).flat();
};
const image = (width: number, height: number, fill: (x: number, y: number) => number[]) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(fill(x, y), (y * width + x) * 4);
  return { width, height, data } as unknown as ImageData;
};

it('gives white for a white ring', () => {
  expect(backgroundOf(new Uint8ClampedArray(px('#ffffff', 20)))).toBe('#ffffff');
});
it('rounds to multiples of 8 and ignores a few dark pixels', () => {
  const ring = new Uint8ClampedArray([...px('#f4ecd8', 20), ...px('#000000', 3)]);
  expect(backgroundOf(ring)).toBe('#f0e8d8');
});
it('gives white for an empty ring', () => {
  expect(backgroundOf(new Uint8ClampedArray(0))).toBe('#ffffff');
});
it('gives an empty ring for a null image', () => {
  expect(ringOf(null, { left: 0, top: 0, width: 4, height: 4 }, 1).length).toBe(0);
});
it('reads the one-pixel ring outside the rectangle at the pixel ratio', () => {
  const img = image(40, 40, (x, y) => (x >= 8 && x < 24 && y >= 8 && y < 24 ? [0, 0, 0, 255] : [244, 236, 216, 255]));
  // rect 5..10 x 5..10 css px at ratio 2 = device 10..20; ring is at device 9 and 20
  const ring = ringOf(img, { left: 5, top: 5, width: 5, height: 5 }, 2);
  expect(ring.length).toBeGreaterThan(0);
  expect(ring.length % 4).toBe(0);
  const dark = Array.from({ length: ring.length / 4 }, (_, i) => ring[i * 4]).filter(v => v === 0).length;
  expect(dark).toBe(ring.length / 4);
  const outside = ringOf(img, { left: 15, top: 15, width: 2, height: 2 }, 2);
  expect(backgroundOf(outside)).toBe('#f0e8d8');
});
it('clips the ring to the image', () => {
  const img = image(10, 10, () => [255, 255, 255, 255]);
  const ring = ringOf(img, { left: -3, top: -3, width: 20, height: 20 }, 1);
  expect(ring.length).toBe(0);
});
