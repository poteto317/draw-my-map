import { normalizeGroups, normalizeRelations } from "@/domain/map/relationGroupModel";
import { validateMapDocumentGraph } from "@/domain/persistence/mapDocumentGraph";
import { normalizeMapDocumentLayoutSpacing } from "@/domain/persistence/mapDocumentLayoutSpacing";
import { normalizeMapDocumentNode } from "@/domain/persistence/mapDocumentNode";
import { normalizeMapDocumentTreeDirection } from "@/domain/persistence/mapDocumentTreeDirection";
import { isRecord } from "@/domain/shared/unknownRecord";
import { normalizeBranchLayouts } from "@/types/branchLayout";
import { normalizeLayoutStyle, projectLayoutStyle } from "@/types/layoutStyle";
import { normalizeTour, projectTour } from "@/types/mapTour";
import type { MapDocumentResult, MapDocumentV3, MapDocumentVersion } from "@/types/mapDocument";
import type { Node } from "@/types/node";

type ParsedMapDocumentJson = {
  document: MapDocumentV3;
  sourceVersion: MapDocumentVersion;
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

  if (!isRecord(value)) {
    return { ok: false, error: "マップデータの形式が不正です。" };
  }

  const record = value;
  if (record.version !== 1 && record.version !== 2 && record.version !== 3) {
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

  const treeDirectionResult = normalizeMapDocumentTreeDirection(record.treeDirection, record.version);
  if (!treeDirectionResult.ok) return treeDirectionResult;
  const layoutSpacingResult = normalizeMapDocumentLayoutSpacing(record.layoutSpacing, record.version);
  if (!layoutSpacingResult.ok) return layoutSpacingResult;

  const treeDirection = treeDirectionResult.value;
  const layoutSpacing = layoutSpacingResult.value;
  const nodeIdSet = new Set(graph.value.map((node) => node.id));
  const layoutStyle = record.version === 3
    ? normalizeLayoutStyle(record.layoutStyle)
    : undefined;
  const branchLayouts = record.version === 3
    ? normalizeBranchLayouts(record.branchLayouts, nodeIdSet)
    : undefined;
  const relations = record.version === 3
    ? normalizeRelations(record.relations, nodeIdSet)
    : undefined;
  const reservedEntityIds = new Set(nodeIdSet);
  for (const relation of relations ?? []) reservedEntityIds.add(relation.id);
  const groups = record.version === 3
    ? normalizeGroups(record.groups, nodeIdSet, reservedEntityIds)
    : undefined;
  const tour = record.version === 3
    ? normalizeTour(record.tour, nodeIdSet, graph.value)
    : undefined;

  return {
    ok: true,
    value: {
      document: {
        version: 3,
        layoutMode: record.layoutMode,
        nodes: graph.value,
        ...(treeDirection === "lr" ? {} : { treeDirection }),
        ...(layoutSpacing === undefined ? {} : { layoutSpacing }),
        ...projectLayoutStyle(layoutStyle),
        ...(branchLayouts === undefined ? {} : { branchLayouts }),
        ...(relations === undefined ? {} : { relations }),
        ...(groups === undefined ? {} : { groups }),
        ...projectTour(tour),
      },
      sourceVersion: record.version,
    },
  };
}

export function parseMapDocumentJson(
  json: string,
): MapDocumentResult<MapDocumentV3> {
  const parsed = parseMapDocumentJsonWithVersion(json);
  if (!parsed.ok) return parsed;
  return { ok: true, value: parsed.value.document };
}
