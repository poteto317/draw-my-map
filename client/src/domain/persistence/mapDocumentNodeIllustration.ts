import { isIllustrationDataUrl } from "@/domain/illustration/illustrationDataUrl";
import { isAcceptableIllustrationSize } from "@/domain/illustration/jpegDimensions";
import type { MapDocumentResult, MapDocumentVersion } from "@/types/mapDocument";

// イラストはversion 3から保存される。それ以前のversionでは、あっても無視する。
export function normalizeMapDocumentNodeIllustration(
  illustration: unknown,
  index: number,
  version: MapDocumentVersion,
): MapDocumentResult<string | undefined> {
  if (version !== 3 || illustration === undefined) {
    return { ok: true, value: undefined };
  }

  // 巨大な画像を仕込まれると、デコード時にメモリ不足になるので、縦横も確かめる
  if (!isIllustrationDataUrl(illustration) || !isAcceptableIllustrationSize(illustration)) {
    return {
      ok: false,
      error: `node[${index}].illustrationは、画像のdata URLである必要があります。`,
    };
  }

  return { ok: true, value: illustration };
}
