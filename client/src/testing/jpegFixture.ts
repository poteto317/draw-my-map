// 縦横だけを宣言する最小の JPEG（SOI + APP0 + SOF + EOI）。寸法の読み取りテスト用で、画像としては描画できない。
export function createJpegBytes(width: number, height: number, sofMarker = 0xc0): number[] {
  return [
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46,
    0xff, sofMarker, 0x00, 0x0b, 0x08,
    height >> 8, height & 0xff, width >> 8, width & 0xff,
    0x01, 0x01, 0x11, 0x00,
    0xff, 0xd9,
  ];
}

export function bytesToJpegDataUrl(bytes: readonly number[]): string {
  return `data:image/jpeg;base64,${btoa(String.fromCharCode(...bytes))}`;
}

export function createJpegDataUrl(width: number, height: number, sofMarker = 0xc0): string {
  return bytesToJpegDataUrl(createJpegBytes(width, height, sofMarker));
}
