import {
  NODE_MAP_LINKS_MAX_COUNT,
  isValidTargetNodeId,
  normalizeNodeMapLink,
  uniqueNodeMapLinks,
} from "@/domain/nodes/nodeMapLink";
import { hasOnlyKeys, hasOwn, isPlainRecord } from "@/domain/shared/unknownRecord";
import type { MapDocumentResult, MapDocumentVersion } from "@/types/mapDocument";
import type { NodeMapLink } from "@/types/node";

const ALLOWED_KEYS = new Set(["targetMapId", "targetNodeId"]);

function failure(index: number): MapDocumentResult<readonly NodeMapLink[] | undefined> {
  return {
    ok: false,
    error: `node[${index}].mapLinksは、有効なマップ ID と任意のノード ID（1以上の安全な整数）からなるマップ間リンクの配列（最大${NODE_MAP_LINKS_MAX_COUNT}件）である必要があります。`,
  };
}

// 件数・要素の形・未知キー・各フィールド型を正規化より先に判定する（L-044, L-443, L-470）
function isBoundedMapLinkArray(values: readonly unknown[]): boolean {
  if (values.length > NODE_MAP_LINKS_MAX_COUNT) return false;
  for (const value of values) {
    if (!isPlainRecord(value)) return false;
    if (!hasOnlyKeys(value, ALLOWED_KEYS)) return false;
    if (!hasOwn(value, "targetMapId") || typeof value.targetMapId !== "string") {
      return false;
    }
    if (
      hasOwn(value, "targetNodeId") &&
      !isValidTargetNodeId(value.targetNodeId)
    ) {
      return false;
    }
  }
  return true;
}

// マップ間リンクは version 3 の任意項目。それ以前の version では、あっても無視する。
// 各要素は normalizeNodeMapLink で正規化し（1 件でも不正なら失敗）、uniqueNodeMapLinks で重複は
// 後のものを捨て、空になれば undefined
export function normalizeMapDocumentNodeMapLinks(
  mapLinks: unknown,
  index: number,
  version: MapDocumentVersion,
): MapDocumentResult<readonly NodeMapLink[] | undefined> {
  if (version !== 3 || mapLinks === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Array.isArray(mapLinks) || !isBoundedMapLinkArray(mapLinks)) {
    return failure(index);
  }
  const normalized: NodeMapLink[] = [];
  for (const entry of mapLinks) {
    const record = entry as Record<string, unknown>;
    const result = normalizeNodeMapLink({
      targetMapId: record.targetMapId,
      ...(hasOwn(record, "targetNodeId")
        ? { targetNodeId: record.targetNodeId }
        : {}),
    });
    if (!result.ok) return failure(index);
    normalized.push(result.link);
  }
  const unique = uniqueNodeMapLinks(normalized);
  return { ok: true, value: unique.length === 0 ? undefined : unique };
}
