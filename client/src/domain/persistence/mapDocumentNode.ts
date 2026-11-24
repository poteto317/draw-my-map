import type { MapDocumentResult, MapDocumentVersion } from "@/types/mapDocument";
import type { Node } from "@/types/node";
import { getIllustratedNodeMinHeight } from "@/domain/nodes/nodeIllustration";
import { normalizeMapDocumentNodeImportance } from "@/domain/persistence/mapDocumentNodeImportance";
import { normalizeMapDocumentNodeLocked } from "@/domain/persistence/mapDocumentNodeLocked";
import { normalizeMapDocumentNodeLayoutPinned } from "@/domain/persistence/mapDocumentNodeLayoutPinned";
import { normalizeMapDocumentNodeIcon } from "@/domain/persistence/mapDocumentNodeIcon";
import { normalizeMapDocumentNodeIllustration } from "@/domain/persistence/mapDocumentNodeIllustration";
import { normalizeMapDocumentNodeKind } from "@/domain/persistence/mapDocumentNodeKind";
import {
  normalizeMapDocumentNodeLabelBold,
  normalizeMapDocumentNodeLabelFontSize,
  normalizeMapDocumentNodeLabelUnderline,
} from "@/domain/persistence/mapDocumentNodeLabelTextStyle";
import { normalizeMapDocumentNodeLinks } from "@/domain/persistence/mapDocumentNodeLinks";
import { normalizeMapDocumentNodeMapLinks } from "@/domain/persistence/mapDocumentNodeMapLinks";
import { normalizeMapDocumentNodeNote } from "@/domain/persistence/mapDocumentNodeNote";
import { normalizeMapDocumentNodeSources } from "@/domain/persistence/mapDocumentNodeSources";
import { normalizeMapDocumentNodeTags } from "@/domain/persistence/mapDocumentNodeTags";
import { projectMapDocumentNode } from "@/domain/persistence/mapDocumentNodeProjection";
import { isRecord } from "@/domain/shared/unknownRecord";

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
  if (!isRecord(value)) {
    return failure(index, "はオブジェクトである必要があります。");
  }

  const node = value;
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
  const illustrationResult = normalizeMapDocumentNodeIllustration(
    node.illustration,
    index,
    version,
  );
  if (!illustrationResult.ok) {
    return illustrationResult;
  }
  const illustration = illustrationResult.value;
  const noteResult = normalizeMapDocumentNodeNote(node.note, index, version);
  if (!noteResult.ok) {
    return noteResult;
  }
  const note = noteResult.value;
  const linksResult = normalizeMapDocumentNodeLinks(node.links, index, version);
  if (!linksResult.ok) {
    return linksResult;
  }
  const links = linksResult.value;
  const tagsResult = normalizeMapDocumentNodeTags(node.tags, index, version);
  if (!tagsResult.ok) {
    return tagsResult;
  }
  const tags = tagsResult.value;
  const sourcesResult = normalizeMapDocumentNodeSources(node.sources, index, version);
  if (!sourcesResult.ok) {
    return sourcesResult;
  }
  const sources = sourcesResult.value;
  const mapLinksResult = normalizeMapDocumentNodeMapLinks(node.mapLinks, index, version);
  if (!mapLinksResult.ok) {
    return mapLinksResult;
  }
  const mapLinks = mapLinksResult.value;
  const lockedResult = normalizeMapDocumentNodeLocked(node.locked, index, version);
  if (!lockedResult.ok) {
    return lockedResult;
  }
  const locked = lockedResult.value;
  const layoutPinnedResult = normalizeMapDocumentNodeLayoutPinned(node.layoutPinned, index, version);
  if (!layoutPinnedResult.ok) {
    return layoutPinnedResult;
  }
  const layoutPinned = layoutPinnedResult.value;
  const labelFontSizeResult = normalizeMapDocumentNodeLabelFontSize(node.labelFontSize, index, version);
  if (!labelFontSizeResult.ok) {
    return labelFontSizeResult;
  }
  const labelFontSize = labelFontSizeResult.value;
  const labelBoldResult = normalizeMapDocumentNodeLabelBold(node.labelBold, index, version);
  if (!labelBoldResult.ok) {
    return labelBoldResult;
  }
  const labelBold = labelBoldResult.value;
  const labelUnderlineResult = normalizeMapDocumentNodeLabelUnderline(node.labelUnderline, index, version);
  if (!labelUnderlineResult.ok) {
    return labelUnderlineResult;
  }
  const labelUnderline = labelUnderlineResult.value;
  const iconResult = normalizeMapDocumentNodeIcon(node.icon, index, version);
  if (!iconResult.ok) {
    return iconResult;
  }
  const icon = iconResult.value;
  const kindResult = normalizeMapDocumentNodeKind(node.kind, index, version);
  if (!kindResult.ok) {
    return kindResult;
  }
  const kind = kindResult.value;
  return {
    ok: true,
    value: projectMapDocumentNode({
      id,
      parentId,
      x,
      y,
      width,
      height: illustration === undefined ? height : getIllustratedNodeMinHeight(height),
      label,
      importance: importanceResult.value,
      ...(illustration === undefined ? {} : { illustration }),
      ...(note === undefined ? {} : { note }),
      ...(links === undefined ? {} : { links }),
      ...(tags === undefined ? {} : { tags }),
      ...(sources === undefined ? {} : { sources }),
      ...(mapLinks === undefined ? {} : { mapLinks }),
      ...(locked === undefined ? {} : { locked }),
      ...(layoutPinned === undefined ? {} : { layoutPinned }),
      ...(labelFontSize === undefined ? {} : { labelFontSize }),
      ...(labelBold === undefined ? {} : { labelBold }),
      ...(labelUnderline === undefined ? {} : { labelUnderline }),
      ...(icon === undefined ? {} : { icon }),
      ...(kind === undefined ? {} : { kind }),
    }),
  };
}
