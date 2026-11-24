import { RECT_HEIGHT, RECT_WIDTH } from "@/config/shapes";
import { FALLBACK_NODE_LABEL } from "@/config/nodeLabel";
import {
  MAX_MAP_NAME_LENGTH,
  normalizeMapName,
  normalizeStoredMapName,
} from "@/domain/mapLibrary/mapName";
import { assertNodesEditable } from "@/domain/nodes/nodeEditLock";
import {
  transferNodeBranch,
  type AllocateEntityIds,
  type BranchMoveFailureReason,
  type BranchTransferMapIds,
} from "@/domain/nodes/nodeBranchMove";
import { listBranchExtractEditableIds } from "@/domain/nodes/branchExtractEditableIds";
import type { Node } from "@/types/node";
import type { NodeMapState } from "@/types/nodeMapState";

export const EXTRACT_BRANCH_DISPLAY_FALLBACK = "無題の枝";
const EXTRACT_MAP_NAME_SEPARATOR = " — ";
const EXTRACT_LABEL_CONTROL = /[\u0000-\u001f\u007f]/g;

export type ExtractBranchFailureReason = BranchMoveFailureReason | "root-not-allowed";

export type ExtractBranchToNewMapInput = {
  source: NodeMapState;
  target: NodeMapState;
  rootId: number;
  newMapId: string;
  sourceMapId: string;
  sourceMapName: string;
  allocateIds: AllocateEntityIds;
};

export type ExtractBranchToNewMapResult =
  | {
    ok: true;
    source: NodeMapState;
    target: NodeMapState;
    stubNodeId: number;
    newMapName: string;
    transferredRootId: number;
  }
  | { ok: false; reason: ExtractBranchFailureReason };

function normalizeExtractDisplayLabel(label: string): string {
  const trimmed = label.replace(EXTRACT_LABEL_CONTROL, " ").trim();
  return trimmed === "" ? EXTRACT_BRANCH_DISPLAY_FALLBACK : trimmed;
}

export function buildExtractBranchDisplayLabel(label: string): string {
  return normalizeExtractDisplayLabel(label);
}

export function buildExtractedMapName(sourceMapName: string, displayLabel: string): string {
  const source = normalizeMapName(sourceMapName);
  const label = normalizeExtractDisplayLabel(displayLabel);
  const separatorLength = Array.from(EXTRACT_MAP_NAME_SEPARATOR).length;
  const sourcePoints = Array.from(source);
  const labelPoints = Array.from(label);

  let truncatedSourcePoints = sourcePoints;
  let truncatedLabelPoints = labelPoints;
  const combinedLength = truncatedSourcePoints.length + separatorLength + truncatedLabelPoints.length;
  if (combinedLength > MAX_MAP_NAME_LENGTH) {
    const roomForLabel = MAX_MAP_NAME_LENGTH - separatorLength - truncatedSourcePoints.length;
    if (roomForLabel >= 0) {
      truncatedLabelPoints = truncatedLabelPoints.slice(0, roomForLabel);
    } else {
      truncatedSourcePoints = truncatedSourcePoints.slice(
        0,
        Math.max(0, MAX_MAP_NAME_LENGTH - separatorLength),
      );
      const roomAfterSource = MAX_MAP_NAME_LENGTH - separatorLength - truncatedSourcePoints.length;
      truncatedLabelPoints = labelPoints.slice(0, Math.max(0, roomAfterSource));
    }
  }

  const truncatedSource = truncatedSourcePoints.join("");
  const truncatedLabel = truncatedLabelPoints.join("");
  const name =
    truncatedLabel.length > 0
      ? `${truncatedSource}${EXTRACT_MAP_NAME_SEPARATOR}${truncatedLabel}`
      : truncatedSource;
  return normalizeStoredMapName(name);
}

function computeSiblingArrayIndex(nodes: readonly Node[], nodeId: number): number {
  const target = nodes.find((node) => node.id === nodeId);
  if (target === undefined) return 0;
  const parentId = target.parentId;
  let index = 0;
  for (const node of nodes) {
    if (node.parentId !== parentId) continue;
    if (node.id === nodeId) return index;
    index += 1;
  }
  return index;
}

function insertStubAtSiblingIndex(
  nodes: readonly Node[],
  stub: Node,
  parentId: number | null,
  siblingIndex: number,
): Node[] {
  const result: Node[] = [];
  let seenSiblings = 0;
  let inserted = false;
  for (const node of nodes) {
    if (!inserted && node.parentId === parentId) {
      if (seenSiblings === siblingIndex) {
        result.push(stub);
        inserted = true;
      }
      seenSiblings += 1;
    }
    result.push(node);
  }
  if (!inserted) {
    result.push(stub);
  }
  return result;
}

function createExtractBranchStub(root: Node, stubId: number, targetMapId: string): Node {
  return {
    id: stubId,
    parentId: root.parentId,
    x: root.x,
    y: root.y,
    width: RECT_WIDTH,
    height: RECT_HEIGHT,
    label: root.label.trim() === "" ? FALLBACK_NODE_LABEL : root.label,
    importance: "medium",
    mapLinks: [{ targetMapId }],
  };
}

export function extractBranchToNewMap(input: ExtractBranchToNewMapInput): ExtractBranchToNewMapResult {
  const { source, target, rootId, newMapId, sourceMapId, sourceMapName, allocateIds } = input;
  const root = source.nodes.find((node) => node.id === rootId);
  if (root === undefined) return { ok: false, reason: "missing-node" };
  if (root.parentId === null) return { ok: false, reason: "root-not-allowed" };

  const editableIds = listBranchExtractEditableIds(source.nodes, rootId);
  const lockedCheck = assertNodesEditable(editableIds, source.nodes);
  if (!lockedCheck.ok && lockedCheck.reason === "locked") return { ok: false, reason: "locked" };

  const siblingIndex = computeSiblingArrayIndex(source.nodes, rootId);
  const displayLabel = buildExtractBranchDisplayLabel(root.label);
  const newMapName = buildExtractedMapName(sourceMapName, displayLabel);
  const mapIds: BranchTransferMapIds = { sourceMapId, targetMapId: newMapId };

  const transferred = transferNodeBranch(source, target, rootId, allocateIds, mapIds);
  if (!transferred.ok) return transferred;

  const [stubId] = allocateIds({
    nodes: transferred.source.nodes,
    relations: transferred.source.relations,
    groups: transferred.source.groups,
  }, 1);
  const stub = createExtractBranchStub(root, stubId, newMapId);
  const sourceNodes = insertStubAtSiblingIndex(transferred.source.nodes, stub, root.parentId, siblingIndex);

  return {
    ok: true,
    source: { ...transferred.source, nodes: sourceNodes },
    target: transferred.target,
    stubNodeId: stubId,
    newMapName,
    transferredRootId: transferred.rootId,
  };
}