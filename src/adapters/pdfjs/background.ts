const WHITE = '#ffffff';

export function backgroundOf(ring: Uint8ClampedArray): string {
  const counts = new Map<number, number>();
  let best = -1;
  let bestCount = 0;
  for (let i = 0; i + 3 < ring.length; i += 4) {
    const key = (((ring[i] ?? 0) >> 3) << 16) | (((ring[i + 1] ?? 0) >> 3) << 8) | ((ring[i + 2] ?? 0) >> 3);
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    if (n > bestCount) {
      best = key;
      bestCount = n;
    }
  }
  if (best < 0) return WHITE;
  const hex = (v: number) => (v === 31 ? 255 : v << 3).toString(16).padStart(2, '0');
  return `#${hex(best >> 16)}${hex((best >> 8) & 31)}${hex(best & 31)}`;
}

export function ringOf(
  image: ImageData | null,
  rect: { left: number; top: number; width: number; height: number },
  ratio: number,
): Uint8ClampedArray {
  if (!image) return new Uint8ClampedArray(0);
  const x0 = Math.floor(rect.left * ratio) - 1;
  const y0 = Math.floor(rect.top * ratio) - 1;
  const x1 = Math.ceil((rect.left + rect.width) * ratio);
  const y1 = Math.ceil((rect.top + rect.height) * ratio);
  const out: number[] = [];
  const take = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
    const at = (y * image.width + x) * 4;
    out.push(image.data[at] ?? 0, image.data[at + 1] ?? 0, image.data[at + 2] ?? 0, image.data[at + 3] ?? 0);
  };
  for (let x = x0; x <= x1; x++) {
    take(x, y0);
    take(x, y1);
  }
  for (let y = y0 + 1; y < y1; y++) {
    take(x0, y);
    take(x1, y);
  }
  return Uint8ClampedArray.from(out);
}
