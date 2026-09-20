import { validateMapDocumentGraph } from "@/domain/persistence/mapDocumentGraph";
import { normalizeMapDocumentNode } from "@/domain/persistence/mapDocumentNode";
import type { MapDocumentResult, MapDocumentV1 } from "@/types/mapDocument";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

function projectMapDocumentNode(node: Node): Node {
  return {
    id: node.id,
    parentId: node.parentId,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    label: node.label,
  };
}

function projectMapDocument(
  nodes: readonly Node[],
  layoutMode: NodeLayoutMode,
): MapDocumentV1 {
  return {
    version: 1,
    layoutMode,
    nodes: nodes.map(projectMapDocumentNode),
  };
}

export function createMapDocument(
  nodes: readonly Node[],
  layoutMode: NodeLayoutMode,
): MapDocumentV1 {
  return projectMapDocument(nodes, layoutMode);
}

export function serializeMapDocument(document: MapDocumentV1): string {
  return `${JSON.stringify(
    projectMapDocument(document.nodes, document.layoutMode),
    null,
    2,
  )}\n`;
}

export function parseMapDocumentJson(
  json: string,
): MapDocumentResult<MapDocumentV1> {
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
  if (record.version !== 1) {
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
    const normalized = normalizeMapDocumentNode(candidate, index);
    if (!normalized.ok) return normalized;
    nodes.push(normalized.value);
  }

  const graph = validateMapDocumentGraph(nodes);
  if (!graph.ok) return graph;

  return {
    ok: true,
    value: {
      version: 1,
      layoutMode: record.layoutMode,
      nodes: graph.value,
    },
  };
}
