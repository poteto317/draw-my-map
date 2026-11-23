// 縦横だけを宣言する最小の PNG（署名 + IHDR）。寸法の読み取りテスト用で、画像としては描画できない。
export function createPngBytes(width: number, height: number): number[] {
  return [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
    (width >>> 24) & 0xff,
    (width >>> 16) & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    (height >>> 24) & 0xff,
    (height >>> 16) & 0xff,
    (height >>> 8) & 0xff,
    height & 0xff,
    0x08, 0x02, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ];
}

export function bytesToPngDataUrl(bytes: readonly number[]): string {
  return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;
}

export function createPngDataUrl(width: number, height: number): string {
  return bytesToPngDataUrl(createPngBytes(width, height));
}
