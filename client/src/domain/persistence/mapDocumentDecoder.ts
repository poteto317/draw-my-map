import { validateMapDocumentGraph } from "@/domain/persistence/mapDocumentGraph";
import { normalizeMapDocumentNode } from "@/domain/persistence/mapDocumentNode";
import type { MapDocumentResult, MapDocumentV2 } from "@/types/mapDocument";
import type { Node } from "@/types/node";

type ParsedMapDocumentJson = {
  document: MapDocumentV2;
  sourceVersion: 1 | 2;
};

export function parseMapDocumentJsonWithVersion(
  json: string,
): MapDocumentResult<ParsedMapDocumentJson> {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return { ok: false, error: "JSONを解析できませんでした。" };
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "マップデータの形式が不正です。" };
  }

  const record = value as Record<string, unknown>;
  if (record.version !== 1 && record.version !== 2) {
    return { ok: false, error: "未対応のマップ形式です。" };
  }
  if (record.layoutMode !== "manual" && record.layoutMode !== "auto") {
    return { ok: false, error: "レイアウトモードが不正です。" };
  }
  if (!Array.isArray(record.nodes)) {
    return { ok: false, error: "ノード一覧が不正です。" };
  }

  const nodes: Node[] = [];
  for (const [index, candidate] of record.nodes.entries()) {
    const normalized = normalizeMapDocumentNode(candidate, index, record.version);
    if (!normalized.ok) return normalized;
    nodes.push(normalized.value);
  }

  const graph = validateMapDocumentGraph(nodes);
  if (!graph.ok) return graph;

  return {
    ok: true,
    value: {
      document: {
        version: 2,
        layoutMode: record.layoutMode,
        nodes: graph.value,
      },
      sourceVersion: record.version,
    },
  };
}

export function parseMapDocumentJson(
  json: string,
): MapDocumentResult<MapDocumentV2> {
  const parsed = parseMapDocumentJsonWithVersion(json);
  if (!parsed.ok) return parsed;
  return { ok: true, value: parsed.value.document };
}
