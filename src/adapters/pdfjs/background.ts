const WHITE = '#ffffff';

export function backgroundOf(ring: Uint8ClampedArray): string {
  const groups = new Map<number, { n: number; r: number; g: number; b: number }>();
  let best: { n: number; r: number; g: number; b: number } | undefined;
  for (let i = 0; i + 3 < ring.length; i += 4) {
    if (ring[i + 3] !== 255) continue;
    const [r, g, b] = [ring[i] ?? 0, ring[i + 1] ?? 0, ring[i + 2] ?? 0];
    const key = ((r >> 3) << 16) | ((g >> 3) << 8) | (b >> 3);
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { n: 0, r: 0, g: 0, b: 0 }));
    group.n++;
    group.r += r;
    group.g += g;
    group.b += b;
    if (!best || group.n > best.n) best = group;
  }
  if (!best) return WHITE;
  const hex = (sum: number) => Math.round(sum / best!.n).toString(16).padStart(2, '0');
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`;
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
