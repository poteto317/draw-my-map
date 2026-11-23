import {
  MAX_ILLUSTRATION_UPLOAD_BYTES,
  MAX_ILLUSTRATION_UPLOAD_DIMENSION,
} from "@/config/illustration";
import { getJpegDimensions } from "@/domain/illustration/jpegDimensions";
import { getPngDimensions } from "@/domain/illustration/pngDimensions";
import { isIllustrationDataUrl } from "@/domain/illustration/illustrationDataUrl";

export type PrepareIllustrationUploadResult =
  | { ok: true; dataUrl: string }
  | { ok: false; reason: "invalid" | "failed" };

export type PrepareIllustrationUploadDeps = {
  readImageFile: (file: File) => Promise<string>;
  createThumbnail: (dataUrl: string) => Promise<string>;
};

export function defaultReadImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("read failed"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function isWithinUploadDimension(width: number, height: number): boolean {
  return (
    width >= 1
    && height >= 1
    && width <= MAX_ILLUSTRATION_UPLOAD_DIMENSION
    && height <= MAX_ILLUSTRATION_UPLOAD_DIMENSION
  );
}

/**
 * アップロード元の縦横が上限内か。JPEG SOF / PNG IHDR などデコード前ヘッダのみ。
 * ヘッダ寸法が取れない形式は拒否（Image.decode しない）。
 */
export function isUploadSourceDimensionsAllowed(dataUrl: string): boolean {
  const dimensions = getJpegDimensions(dataUrl) ?? getPngDimensions(dataUrl);
  if (dimensions === null) return false;
  return isWithinUploadDimension(dimensions.width, dimensions.height);
}

/**
 * ファイル → data URL 読取 → サムネイル → illustration 受理判定。
 * 上書き確認（UI 対話）は呼び出し側の責務。ここは I/O と検証のみ。
 * File.size と元画像の縦横をサムネイル／本デコード経路の前に調べ、巨大入力で OOM しないようにする。
 */
export async function prepareIllustrationUpload(
  file: File,
  deps: PrepareIllustrationUploadDeps,
): Promise<PrepareIllustrationUploadResult> {
  if (file.size > MAX_ILLUSTRATION_UPLOAD_BYTES) {
    return { ok: false, reason: "invalid" };
  }

  try {
    const sourceDataUrl = await deps.readImageFile(file);
    if (!isUploadSourceDimensionsAllowed(sourceDataUrl)) {
      return { ok: false, reason: "invalid" };
    }

    const thumbnail = await deps.createThumbnail(sourceDataUrl);
    if (!isIllustrationDataUrl(thumbnail)) {
      return { ok: false, reason: "invalid" };
    }
    return { ok: true, dataUrl: thumbnail };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
