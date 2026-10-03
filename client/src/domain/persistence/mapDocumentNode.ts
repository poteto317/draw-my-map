import type { MapDocumentResult, MapDocumentVersion } from "@/types/mapDocument";
import type { Node } from "@/types/node";
import { isIllustrationDataUrl } from "@/domain/illustration/illustrationDataUrl";
import { normalizeMapDocumentNodeImportance } from "@/domain/persistence/mapDocumentNodeImportance";
import { projectMapDocumentNode } from "@/domain/persistence/mapDocumentNodeProjection";

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
  version: MapDocumentVersion,
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
  const importanceResult = normalizeMapDocumentNodeImportance(
    node.importance,
    index,
    version,
  );
  if (!importanceResult.ok) {
    return importanceResult;
  }
  let illustration: string | undefined;
  if (version === 3 && node.illustration !== undefined) {
    if (!isIllustrationDataUrl(node.illustration)) {
      return failure(index, ".illustrationは、画像のdata URLである必要があります。");
    }
    illustration = node.illustration;
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
      importance: importanceResult.value,
      ...(illustration === undefined ? {} : { illustration }),
    }),
  };
}
