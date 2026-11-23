import {
  MAX_ILLUSTRATION_UPLOAD_BYTES,
  MAX_ILLUSTRATION_UPLOAD_DIMENSION,
} from "@/config/illustration";
import { getJpegDimensions } from "@/domain/illustration/jpegDimensions";
import { isIllustrationDataUrl } from "@/domain/illustration/illustrationDataUrl";

export type PrepareIllustrationUploadResult =
  | { ok: true; dataUrl: string }
  | { ok: false; reason: "invalid" | "failed" };

export type PrepareIllustrationUploadDeps = {
  readImageFile: (file: File) => Promise<string>;
  createThumbnail: (dataUrl: string) => Promise<string>;
  /** 非 JPEG などヘッダ寸法が取れないとき、デコード直後の縦横を返す */
  loadImageDimensions: (dataUrl: string) => Promise<{ width: number; height: number }>;
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

export async function defaultLoadImageDimensions(
  dataUrl: string,
): Promise<{ width: number; height: number }> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  return { width: image.naturalWidth, height: image.naturalHeight };
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
 * アップロード元の縦横が上限内か。JPEG は SOF ヘッダのみ（デコードしない）。
 * それ以外は loadImageDimensions（デコード直後）で判定する。
 */
export async function isUploadSourceDimensionsAllowed(
  dataUrl: string,
  loadImageDimensions: (dataUrl: string) => Promise<{ width: number; height: number }>,
): Promise<boolean> {
  const jpegDimensions = getJpegDimensions(dataUrl);
  if (jpegDimensions !== null) {
    return isWithinUploadDimension(jpegDimensions.width, jpegDimensions.height);
  }
  if (dataUrl.startsWith("data:image/jpeg;base64,")) {
    // JPEG なのに SOF が読めない → 寸法不明として拒否
    return false;
  }
  try {
    const { width, height } = await loadImageDimensions(dataUrl);
    return isWithinUploadDimension(width, height);
  } catch {
    return false;
  }
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
    const dimensionsOk = await isUploadSourceDimensionsAllowed(
      sourceDataUrl,
      deps.loadImageDimensions,
    );
    if (!dimensionsOk) {
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
