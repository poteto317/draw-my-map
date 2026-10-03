import {
  IllustrationRequestError,
  requestIllustration,
  type IllustrationErrorKind,
} from "@/services/illustration/illustrationClient";
import {
  IllustrationThumbnailError,
  createIllustrationThumbnail,
} from "@/services/illustration/illustrationThumbnail";

// ラベルからイラストを生成し、保存用に縮小したサムネイルの data URL を返す
export async function generateIllustrationThumbnail(
  label: string,
  options: { signal?: AbortSignal },
): Promise<string> {
  const image = await requestIllustration(label, { signal: options.signal });
  return createIllustrationThumbnail(image.dataUrl);
}

// 生成の失敗を、利用者向けの種別に分類する。
// 中断（AbortError）かどうかは見ない。呼び出し側が、先に中断を判定する。
export function toIllustrationErrorKind(error: unknown): IllustrationErrorKind {
  if (error instanceof IllustrationRequestError) return error.kind;
  if (error instanceof IllustrationThumbnailError) return "image-processing";
  return "upstream-error";
}
