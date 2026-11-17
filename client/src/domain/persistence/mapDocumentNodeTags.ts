import {
  NODE_TAGS_MAX_COUNT,
  NODE_TAG_INPUT_MAX_LENGTH,
  NODE_TAG_MAX_LENGTH,
  normalizeNodeTagName,
  uniqueNodeTags,
} from "@/domain/nodes/nodeTag";
import type { MapDocumentResult, MapDocumentVersion } from "@/types/mapDocument";

function failure(index: number): MapDocumentResult<readonly string[] | undefined> {
  return {
    ok: false,
    error: `node[${index}].tagsは、${NODE_TAG_MAX_LENGTH}文字以内のタグ名の配列（最大${NODE_TAGS_MAX_COUNT}件）である必要があります。`,
  };
}

// 件数と各要素の型・長さ（前後の空白を削る前の length）を、タグ名の正規化より先に判定する（L-443）
function isBoundedStringArray(values: readonly unknown[]): values is readonly string[] {
  return values.length <= NODE_TAGS_MAX_COUNT
    && values.every((value) => typeof value === "string" && value.length <= NODE_TAG_INPUT_MAX_LENGTH);
}

// タグは version 3 の任意項目。それ以前の version では、あっても無視する。
// 各要素は normalizeNodeTagName で正規化した名前にし（1 件でも不正なら失敗）、uniqueNodeTags で nodeTagKey が同じものは
// 後のものを捨て、空になれば undefined
export function normalizeMapDocumentNodeTags(
  tags: unknown,
  index: number,
  version: MapDocumentVersion,
): MapDocumentResult<readonly string[] | undefined> {
  if (version !== 3 || tags === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Array.isArray(tags) || !isBoundedStringArray(tags)) {
    return failure(index);
  }
  const names: string[] = [];
  for (const tag of tags) {
    const result = normalizeNodeTagName(tag);
    if (!result.ok) return failure(index);
    names.push(result.name);
  }
  const normalized = uniqueNodeTags(names);
  return { ok: true, value: normalized.length === 0 ? undefined : normalized };
}
