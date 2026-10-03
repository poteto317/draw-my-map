import { MAX_ILLUSTRATION_IMAGE_DIMENSION } from "@/config/illustration";

const DATA_URL_PREFIX = "data:image/jpeg;base64,";

// SOF0〜SOF15。ただし DHT(C4)・JPG(C8)・DAC(CC) は除く
function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function decodeBase64(body: string): Uint8Array | null {
  try {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

// JPEG の data URL から、SOF マーカーの縦横を読む。読めなければ null。
// 画像のデコードはしないので、巨大な画像でもメモリを使わない。
export function getJpegDimensions(dataUrl: string): { width: number; height: number } | null {
  if (!dataUrl.startsWith(DATA_URL_PREFIX)) return null;
  const bytes = decodeBase64(dataUrl.slice(DATA_URL_PREFIX.length));
  if (bytes === null || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  // offset は毎回 2 以上進むので、必ず終わる
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1; // 詰め物の 0xFF
      continue;
    }
    offset += 2;
    // 長さを持たないマーカー
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    // SOF より前に、画像データ（SOS）や終端（EOI）が来たら、寸法は無い
    if (marker === 0xd9 || marker === 0xda) return null;

    if (offset + 2 > bytes.length) return null;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2) return null;
    if (isStartOfFrame(marker)) {
      // 長さ(2) + 精度(1) + 高さ(2) + 幅(2)
      if (length < 7 || offset + 7 > bytes.length) return null;
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      };
    }
    offset += length;
  }
  return null;
}

export function isAcceptableIllustrationSize(dataUrl: string): boolean {
  const dimensions = getJpegDimensions(dataUrl);
  if (dimensions === null) return false;
  const { width, height } = dimensions;
  return (
    width >= 1 && width <= MAX_ILLUSTRATION_IMAGE_DIMENSION
    && height >= 1 && height <= MAX_ILLUSTRATION_IMAGE_DIMENSION
  );
}
