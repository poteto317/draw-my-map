import { parseMapDocumentJson } from "@/domain/persistence/mapDocumentCodec";
import { SHARE_MESSAGES } from "@/domain/share/shareMessages";
import type { MapDocument } from "@/types/mapDocument";

export type ShareViewDocumentParse =
  | { ok: true; document: MapDocument }
  | { ok: false; error: string };

/**
 * 閲覧 API の documentJson を MapDocument に変換する（UI 組み立て用）。
 * 失敗時は固定文言（内部エラー詳細は出さない）。
 */
export function parseShareViewDocumentJson(documentJson: string): ShareViewDocumentParse {
  const parsed = parseMapDocumentJson(documentJson);
  if (!parsed.ok) {
    return { ok: false, error: SHARE_MESSAGES.viewLoadFailed };
  }
  return { ok: true, document: parsed.value };
}

/**
 * ShareViewer へ渡す document を検証する。
 * null は呼び出し側で「未取得（loading）」と区別する。不正オブジェクトは失敗。
 */
export function asShareViewDocument(value: unknown): ShareViewDocumentParse {
  if (value === null || value === undefined) {
    return { ok: false, error: SHARE_MESSAGES.viewLoadFailed };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: SHARE_MESSAGES.viewLoadFailed };
  }
  const record = value as Record<string, unknown>;
  if (record.version !== 3 || !Array.isArray(record.nodes)) {
    return { ok: false, error: SHARE_MESSAGES.viewLoadFailed };
  }
  // Page 経由のデコード済み MapDocument を信頼（再パースは JSON 経路のみ）
  return { ok: true, document: value as MapDocument };
}
