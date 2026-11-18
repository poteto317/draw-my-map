import { NODE_LINK_MAX_LENGTH } from "@/domain/nodes/nodeLink";
import {
  NODE_SOURCES_MAX_COUNT,
  NODE_SOURCE_INPUT_MAX_LENGTH,
  NODE_SOURCE_PAGE_MAX_LENGTH,
  NODE_SOURCE_TITLE_MAX_LENGTH,
  normalizeNodeSource,
  uniqueNodeSources,
} from "@/domain/nodes/nodeSource";
import { isRecord } from "@/domain/shared/unknownRecord";
import type { MapDocumentResult, MapDocumentVersion } from "@/types/mapDocument";
import type { NodeSource } from "@/types/node";

const ALLOWED_KEYS = new Set(["title", "page", "url"]);

function failure(index: number): MapDocumentResult<readonly NodeSource[] | undefined> {
  return {
    ok: false,
    error: `node[${index}].sourcesは、タイトル（${NODE_SOURCE_TITLE_MAX_LENGTH}文字以内）・ページ（${NODE_SOURCE_PAGE_MAX_LENGTH}文字以内）・http/https の URL からなる出典の配列（最大${NODE_SOURCES_MAX_COUNT}件）である必要があります。`,
  };
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

// 件数・要素の形・未知キー・各文字列の length（前後の空白を削る前）を、正規化より先に判定する（L-443）
function isBoundedSourceArray(values: readonly unknown[]): boolean {
  if (values.length > NODE_SOURCES_MAX_COUNT) return false;
  for (const value of values) {
    if (!isRecord(value)) return false;
    const keys = Object.keys(value);
    if (keys.some((key) => !ALLOWED_KEYS.has(key))) return false;
    if (!("title" in value) || !isBoundedString(value.title, NODE_SOURCE_INPUT_MAX_LENGTH)) {
      return false;
    }
    if ("page" in value && !isBoundedString(value.page, NODE_SOURCE_INPUT_MAX_LENGTH)) {
      return false;
    }
    if ("url" in value && !isBoundedString(value.url, NODE_LINK_MAX_LENGTH)) {
      return false;
    }
  }
  return true;
}

// 出典は version 3 の任意項目。それ以前の version では、あっても無視する。
// 各要素は normalizeNodeSource で正規化し（1 件でも不正なら失敗）、uniqueNodeSources で鍵が同じものは
// 後のものを捨て、空になれば undefined
export function normalizeMapDocumentNodeSources(
  sources: unknown,
  index: number,
  version: MapDocumentVersion,
): MapDocumentResult<readonly NodeSource[] | undefined> {
  if (version !== 3 || sources === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Array.isArray(sources) || !isBoundedSourceArray(sources)) {
    return failure(index);
  }
  const normalized: NodeSource[] = [];
  for (const entry of sources) {
    const record = entry as Record<string, unknown>;
    const result = normalizeNodeSource({
      title: record.title as string,
      page: "page" in record ? (record.page as string) : undefined,
      url: "url" in record ? (record.url as string) : undefined,
    });
    if (!result.ok) return failure(index);
    normalized.push(result.source);
  }
  const unique = uniqueNodeSources(normalized);
  return { ok: true, value: unique.length === 0 ? undefined : unique };
}
