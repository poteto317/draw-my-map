import type { MapDocumentResult } from "@/types/mapDocument";
import type { Node } from "@/types/node";
import { projectMapDocumentNode } from "@/domain/persistence/mapDocumentNodeProjection";
import { DEFAULT_NODE_IMPORTANCE } from "@/domain/nodes/nodeImportance";

type NodeRecord = Record<string, unknown>;

function failure(index: number, message: string): MapDocumentResult<Node> {
  return { ok: false, error: `node[${index}]${message}` };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function normalizeMapDocumentNode(
  value: unknown,
  index: number,
  version: 1 | 2,
): MapDocumentResult<Node> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return failure(index, "はオブジェクトである必要があります。");
  }

  const node = value as NodeRecord;
  const { id, parentId, x, y, width, height, label } = node;
  if (!isSafeInteger(id) || id <= 0) {
    return failure(index, ".idは1以上の安全な整数である必要があります。");
  }
  if (parentId !== null && (!isSafeInteger(parentId) || parentId <= 0)) {
    return failure(index, ".parentIdはnullまたは1以上の安全な整数である必要があります。");
  }
  if (!isFiniteNumber(x)) {
    return failure(index, ".xは有限の数値である必要があります。");
  }
  if (!isFiniteNumber(y)) {
    return failure(index, ".yは有限の数値である必要があります。");
  }
  if (!isFiniteNumber(width) || width <= 0) {
    return failure(index, ".widthは0より大きい有限の数値である必要があります。");
  }
  if (!isFiniteNumber(height) || height <= 0) {
    return failure(index, ".heightは0より大きい有限の数値である必要があります。");
  }
  if (typeof label !== "string") {
    return failure(index, ".labelは文字列である必要があります。");
  }
  const importance = version === 1 ? DEFAULT_NODE_IMPORTANCE : node.importance;
  if (importance !== "high" && importance !== "medium" && importance !== "low") {
    return failure(index, ".importanceはhigh、medium、lowのいずれかである必要があります。");
  }
  return {
    ok: true,
    value: projectMapDocumentNode({
      id,
      parentId,
      x,
      y,
      width,
      height,
      label,
      importance,
    }),
  };
}
