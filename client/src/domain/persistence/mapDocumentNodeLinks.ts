import { NODE_LINKS_MAX_COUNT, NODE_LINK_MAX_LENGTH, normalizeNodeLinkUrl } from "@/domain/nodes/nodeLink";
import type { MapDocumentResult, MapDocumentVersion } from "@/types/mapDocument";

function failure(index: number): MapDocumentResult<readonly string[] | undefined> {
  return {
    ok: false,
    error: `node[${index}].linksは、http または https の URL（${NODE_LINK_MAX_LENGTH}文字以内）の配列（最大${NODE_LINKS_MAX_COUNT}件）である必要があります。`,
  };
}

// 件数と各要素の型・長さ（前後の空白を削る前の length）を、URL の解析より先に判定する（L-443）
function isBoundedStringArray(values: readonly unknown[]): values is readonly string[] {
  return values.length <= NODE_LINKS_MAX_COUNT
    && values.every((value) => typeof value === "string" && value.length <= NODE_LINK_MAX_LENGTH);
}

// URL の添付は version 3 の任意項目。それ以前の version では、あっても無視する。
// 各要素は normalizeNodeLinkUrl で正規化した値（URL.href）にし、重複は後のものを捨て、空になれば undefined
export function normalizeMapDocumentNodeLinks(
  links: unknown,
  index: number,
  version: MapDocumentVersion,
): MapDocumentResult<readonly string[] | undefined> {
  if (version !== 3 || links === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Array.isArray(links) || !isBoundedStringArray(links)) {
    return failure(index);
  }
  const normalized: string[] = [];
  for (const link of links) {
    const result = normalizeNodeLinkUrl(link);
    if (!result.ok) return failure(index);
    if (!normalized.includes(result.url)) normalized.push(result.url);
  }
  return { ok: true, value: normalized.length === 0 ? undefined : normalized };
}
