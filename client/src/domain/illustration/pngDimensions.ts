const DATA_URL_PREFIX = "data:image/png;base64,";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const IHDR_TYPE = [0x49, 0x48, 0x44, 0x52] as const; // "IHDR"
const IHDR_DATA_LENGTH = 13;
// 署名(8) + length(4) + type(4) + data(13)
const IHDR_END = 8 + 4 + 4 + IHDR_DATA_LENGTH;

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

function readUint32Be(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!)
    >>> 0
  );
}

/**
 * PNG の data URL から、先頭 IHDR の縦横を読む。読めなければ null。
 * 画像のデコードはしないので、巨大な画像でもメモリを使わない。
 */
export function getPngDimensions(dataUrl: string): { width: number; height: number } | null {
  if (!dataUrl.startsWith(DATA_URL_PREFIX)) return null;
  const bytes = decodeBase64(dataUrl.slice(DATA_URL_PREFIX.length));
  if (bytes === null || bytes.length < IHDR_END) return null;

  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) return null;
  }

  const length = readUint32Be(bytes, 8);
  if (length !== IHDR_DATA_LENGTH) return null;
  for (let index = 0; index < IHDR_TYPE.length; index += 1) {
    if (bytes[12 + index] !== IHDR_TYPE[index]) return null;
  }

  return {
    width: readUint32Be(bytes, 16),
    height: readUint32Be(bytes, 20),
  };
}
