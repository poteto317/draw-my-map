import * as Y from "yjs";
import {
  normalizeGroups,
  normalizeRelations,
  projectGroups,
  projectRelations,
} from "@/domain/map/relationGroupModel";
import { validateMapDocumentGraph } from "@/domain/persistence/mapDocumentGraph";
import {
  normalizeMapDocumentLayoutSpacing,
  projectMapDocumentLayoutSpacing,
} from "@/domain/persistence/mapDocumentLayoutSpacing";
import { normalizeMapDocumentNode } from "@/domain/persistence/mapDocumentNode";
import {
  normalizeMapDocumentTreeDirection,
  projectMapDocumentTreeDirection,
} from "@/domain/persistence/mapDocumentTreeDirection";
import { normalizeBranchLayouts, projectBranchLayouts } from "@/types/branchLayout";
import { normalizeLayoutStyle, projectLayoutStyle } from "@/types/layoutStyle";
import { normalizeLearn, projectLearn } from "@/types/mapLearn";
import { normalizeTour, projectTour } from "@/types/mapTour";
import type { MapDocumentV3 } from "@/types/mapDocument";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

export type CollabCodecResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      reason: "invalid-document" | "id-collision" | "encode-error" | "decode-error";
    };

const NODES_KEY = "nodes";
const META_KEY = "meta";

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function initialNextId(nodes: readonly Node[]): number {
  let maxId = 0;
  for (const current of nodes) {
    if (current.id > maxId) maxId = current.id;
  }
  return maxId + 1;
}

function isLayoutMode(value: unknown): value is NodeLayoutMode {
  return value === "manual" || value === "auto";
}

function hasDuplicateNodeIds(nodes: readonly Node[]): boolean {
  const seen = new Set<number>();
  for (const current of nodes) {
    if (seen.has(current.id)) return true;
    seen.add(current.id);
  }
  return false;
}

function normalizeNodes(
  candidates: readonly unknown[],
): CollabCodecResult<Node[]> {
  const nodes: Node[] = [];
  for (const [index, candidate] of candidates.entries()) {
    const normalized = normalizeMapDocumentNode(candidate, index, 3);
    if (!normalized.ok) {
      return { ok: false, reason: "invalid-document" };
    }
    nodes.push(normalized.value);
  }
  if (hasDuplicateNodeIds(nodes)) {
    return { ok: false, reason: "id-collision" };
  }
  const graph = validateMapDocumentGraph(nodes);
  if (!graph.ok) {
    return { ok: false, reason: "invalid-document" };
  }
  return { ok: true, value: graph.value };
}

type OptionalMetaInput = {
  treeDirection: unknown;
  hasTreeDirection: boolean;
  layoutSpacing: unknown;
  hasLayoutSpacing: boolean;
  layoutStyle: unknown;
  hasLayoutStyle: boolean;
  branchLayouts: unknown;
  hasBranchLayouts: boolean;
  relations: unknown;
  hasRelations: boolean;
  groups: unknown;
  hasGroups: boolean;
  tour: unknown;
  hasTour: boolean;
  learn: unknown;
  hasLearn: boolean;
};

function normalizeOptionalMeta(
  input: OptionalMetaInput,
  nodes: readonly Node[],
): CollabCodecResult<Partial<Omit<MapDocumentV3, "version" | "layoutMode" | "nodes">>> {
  const treeDirectionResult = normalizeMapDocumentTreeDirection(
    input.hasTreeDirection ? input.treeDirection : undefined,
    3,
  );
  if (!treeDirectionResult.ok) {
    return { ok: false, reason: "invalid-document" };
  }

  const layoutSpacingResult = normalizeMapDocumentLayoutSpacing(
    input.hasLayoutSpacing ? input.layoutSpacing : undefined,
    3,
  );
  if (!layoutSpacingResult.ok) {
    return { ok: false, reason: "invalid-document" };
  }

  const nodeIdSet = new Set(nodes.map((node) => node.id));
  const layoutStyle = input.hasLayoutStyle
    ? normalizeLayoutStyle(input.layoutStyle)
    : undefined;
  const branchLayouts = input.hasBranchLayouts
    ? normalizeBranchLayouts(input.branchLayouts, nodeIdSet)
    : undefined;
  const relations = input.hasRelations
    ? normalizeRelations(input.relations, nodeIdSet)
    : undefined;
  const reservedEntityIds = new Set(nodeIdSet);
  for (const relation of relations ?? []) reservedEntityIds.add(relation.id);
  const groups = input.hasGroups
    ? normalizeGroups(input.groups, nodeIdSet, reservedEntityIds)
    : undefined;
  const tour = input.hasTour
    ? normalizeTour(input.tour, nodeIdSet, nodes)
    : undefined;
  const learn = input.hasLearn ? normalizeLearn(input.learn) : undefined;

  return {
    ok: true,
    value: {
      ...projectMapDocumentTreeDirection(treeDirectionResult.value),
      ...projectMapDocumentLayoutSpacing(layoutSpacingResult.value),
      ...projectLayoutStyle(layoutStyle),
      ...projectBranchLayouts(branchLayouts),
      ...projectRelations(relations),
      ...projectGroups(groups),
      ...projectTour(tour),
      ...projectLearn(learn),
    },
  };
}

function optionalMetaFromDocument(doc: MapDocumentV3): OptionalMetaInput {
  return {
    treeDirection: doc.treeDirection,
    hasTreeDirection: Object.hasOwn(doc, "treeDirection"),
    layoutSpacing: doc.layoutSpacing,
    hasLayoutSpacing: Object.hasOwn(doc, "layoutSpacing"),
    layoutStyle: doc.layoutStyle,
    hasLayoutStyle: Object.hasOwn(doc, "layoutStyle"),
    branchLayouts: doc.branchLayouts,
    hasBranchLayouts: Object.hasOwn(doc, "branchLayouts"),
    relations: doc.relations,
    hasRelations: Object.hasOwn(doc, "relations"),
    groups: doc.groups,
    hasGroups: Object.hasOwn(doc, "groups"),
    tour: doc.tour,
    hasTour: Object.hasOwn(doc, "tour"),
    learn: doc.learn,
    hasLearn: Object.hasOwn(doc, "learn"),
  };
}

function optionalMetaFromYMeta(meta: Y.Map<unknown>): OptionalMetaInput {
  return {
    treeDirection: meta.get("treeDirection"),
    hasTreeDirection: meta.has("treeDirection"),
    layoutSpacing: meta.get("layoutSpacing"),
    hasLayoutSpacing: meta.has("layoutSpacing"),
    layoutStyle: meta.get("layoutStyle"),
    hasLayoutStyle: meta.has("layoutStyle"),
    branchLayouts: meta.get("branchLayouts"),
    hasBranchLayouts: meta.has("branchLayouts"),
    relations: meta.get("relations"),
    hasRelations: meta.has("relations"),
    groups: meta.get("groups"),
    hasGroups: meta.has("groups"),
    tour: meta.get("tour"),
    hasTour: meta.has("tour"),
    learn: meta.get("learn"),
    hasLearn: meta.has("learn"),
  };
}

function encodeNodeToYMap(node: Node): Y.Map<unknown> {
  const yNode = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(node)) {
    if (value === undefined) continue;
    yNode.set(key, cloneJsonValue(value));
  }
  return yNode;
}

function normalizeDocument(
  doc: MapDocumentV3,
): CollabCodecResult<MapDocumentV3> {
  if (doc.version !== 3) {
    return { ok: false, reason: "invalid-document" };
  }
  if (!isLayoutMode(doc.layoutMode)) {
    return { ok: false, reason: "invalid-document" };
  }
  if (!Array.isArray(doc.nodes)) {
    return { ok: false, reason: "invalid-document" };
  }

  const nodesResult = normalizeNodes(doc.nodes);
  if (!nodesResult.ok) return nodesResult;

  const metaResult = normalizeOptionalMeta(
    optionalMetaFromDocument(doc),
    nodesResult.value,
  );
  if (!metaResult.ok) return metaResult;

  return {
    ok: true,
    value: {
      version: 3,
      layoutMode: doc.layoutMode,
      nodes: nodesResult.value,
      ...metaResult.value,
    },
  };
}

function writeDocumentIntoYDoc(
  ydoc: Y.Doc,
  document: MapDocumentV3,
  origin: unknown,
): void {
  const nodesMap = ydoc.getMap(NODES_KEY);
  const meta = ydoc.getMap(META_KEY);

  ydoc.transact(() => {
    for (const key of [...nodesMap.keys()]) {
      nodesMap.delete(key);
    }
    for (const current of document.nodes) {
      nodesMap.set(String(current.id), encodeNodeToYMap(current));
    }

    meta.set("nextId", initialNextId(document.nodes));
    meta.set("version", document.version);
    meta.set("layoutMode", document.layoutMode);

    for (const key of [
      "treeDirection",
      "layoutSpacing",
      "layoutStyle",
      "branchLayouts",
      "relations",
      "groups",
      "tour",
      "learn",
    ] as const) {
      if (!Object.hasOwn(document, key)) {
        if (meta.has(key)) meta.delete(key);
        continue;
      }
      const value = document[key];
      if (value === undefined) {
        if (meta.has(key)) meta.delete(key);
        continue;
      }
      meta.set(key, cloneJsonValue(value));
    }
  }, origin);
}

export function mapDocumentToYDoc(doc: MapDocumentV3): CollabCodecResult<Y.Doc> {
  try {
    const normalized = normalizeDocument(doc);
    if (!normalized.ok) return normalized;

    const ydoc = new Y.Doc();
    writeDocumentIntoYDoc(ydoc, normalized.value, null);
    return { ok: true, value: ydoc };
  } catch {
    return { ok: false, reason: "encode-error" };
  }
}

/**
 * 既存 Y.Doc へ MapDocument を書き込む（共同編集中のローカル編集反映）。
 * origin を渡すと UndoManager の trackedOrigins と揃えられる。
 */
export function applyMapDocumentToYDoc(
  ydoc: Y.Doc,
  doc: MapDocumentV3,
  origin: unknown = null,
): CollabCodecResult<void> {
  try {
    const normalized = normalizeDocument(doc);
    if (!normalized.ok) return normalized;
    writeDocumentIntoYDoc(ydoc, normalized.value, origin);
    return { ok: true, value: undefined };
  } catch {
    return { ok: false, reason: "encode-error" };
  }
}

export function yDocToMapDocument(ydoc: Y.Doc): CollabCodecResult<MapDocumentV3> {
  try {
    if (!ydoc.share.has(NODES_KEY) || !ydoc.share.has(META_KEY)) {
      return { ok: false, reason: "decode-error" };
    }

    const nodesMap = ydoc.getMap(NODES_KEY);
    const meta = ydoc.getMap(META_KEY);

    const version = meta.get("version");
    const layoutMode = meta.get("layoutMode");
    const nextId = meta.get("nextId");

    if (version !== 3 || !isLayoutMode(layoutMode)) {
      return { ok: false, reason: "invalid-document" };
    }
    if (typeof nextId !== "number" || !Number.isInteger(nextId) || nextId < 1) {
      return { ok: false, reason: "decode-error" };
    }

    const rawNodes: unknown[] = [];
    for (const [key, value] of nodesMap.entries()) {
      if (!(value instanceof Y.Map)) {
        return { ok: false, reason: "decode-error" };
      }
      const raw = value.toJSON() as Record<string, unknown>;
      if (String(raw.id) !== key) {
        return { ok: false, reason: "decode-error" };
      }
      rawNodes.push(raw);
    }

    const nodesResult = normalizeNodes(rawNodes);
    if (!nodesResult.ok) return nodesResult;

    const metaResult = normalizeOptionalMeta(
      optionalMetaFromYMeta(meta),
      nodesResult.value,
    );
    if (!metaResult.ok) return metaResult;

    return {
      ok: true,
      value: {
        version: 3,
        layoutMode,
        nodes: nodesResult.value,
        ...metaResult.value,
      },
    };
  } catch {
    return { ok: false, reason: "decode-error" };
  }
}
