import { NODE_NOTE_MAX_LENGTH, normalizeNodeNote } from "@/domain/nodes/nodeNote";
import type { MapDocumentResult, MapDocumentVersion } from "@/types/mapDocument";

// 詳細メモは version 3 の任意項目。それ以前の version では、あっても無視する。
// 上限は入力の文字列の length で、正規化より先に判定する（L-443）。上限内なら正規化した値を返す
// （末尾の対になっていない上位サロゲートを削り、空白だけなら undefined）
export function normalizeMapDocumentNodeNote(
  note: unknown,
  index: number,
  version: MapDocumentVersion,
): MapDocumentResult<string | undefined> {
  if (version !== 3 || note === undefined) {
    return { ok: true, value: undefined };
  }
  if (typeof note !== "string" || note.length > NODE_NOTE_MAX_LENGTH) {
    return {
      ok: false,
      error: `node[${index}].noteは${NODE_NOTE_MAX_LENGTH}文字以内の文字列である必要があります。`,
    };
  }
  return { ok: true, value: normalizeNodeNote(note) };
}
