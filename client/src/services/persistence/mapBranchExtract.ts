import {
  addMapEntry,
  createMapIndexEntry,
  encodeMapIndex,
  findMapEntry,
  openMapAfterBranchTransfer,
  type MapIndexV1,
} from "@/domain/mapLibrary/mapIndex";
import { BRANCH_EXTRACT_STORED_ERROR_MESSAGE } from "@/domain/mapLibrary/mapLibraryMessages";
import { extractBranchToNewMap } from "@/domain/nodes/extractBranchToMap";
import { createNodeIdAllocator } from "@/domain/nodes/nodeIdAllocator";
import { createMapDocument, parseMapDocumentJson, serializeMapDocument } from "@/domain/persistence/mapDocumentCodec";
import {
  mapDocumentOptionsForNewMap,
  mapDocumentOptionsFromState,
} from "@/domain/persistence/mapDocumentState";
import type { NodeMapState } from "@/types/nodeMapState";
import { readBranchMoveIndex } from "./mapBranchTransfer";
import { writeBranchMove } from "./branchMoveTransaction";
import { readMapBody, type MapLibraryStorage } from "./mapLibraryStorage";

export type StoredBranchExtractResult =
  | { ok: true; index: MapIndexV1; newMapId: string; stubNodeId: number }
  | { ok: false; error: string; recoveryRequired: boolean; sourceJson: string | null };

type TransferDocuments =
  | { ok: true; sourceJson: string; source: NodeMapState; sourceMapName: string }
  | { ok: false; sourceJson: string | null };

function readExtractDocuments(
  storage: MapLibraryStorage,
  sourceId: string,
  index: MapIndexV1,
): TransferDocuments {
  const sourceRaw = readMapBody(storage, sourceId);
  if (!sourceRaw.ok || sourceRaw.value === null) return { ok: false, sourceJson: null };
  const source = parseMapDocumentJson(sourceRaw.value);
  if (!source.ok) return { ok: false, sourceJson: sourceRaw.value };
  const entry = findMapEntry(index, sourceId);
  const sourceMapName = entry?.name ?? "";
  return { ok: true, sourceJson: sourceRaw.value, source: source.value, sourceMapName };
}

export function extractStoredBranch(
  storage: MapLibraryStorage,
  index: MapIndexV1,
  sourceId: string,
  newMapId: string,
  rootId: number,
  now: Date,
): StoredBranchExtractResult {
  const failed = (sourceJson: string | null = null): StoredBranchExtractResult => ({
    ok: false,
    error: BRANCH_EXTRACT_STORED_ERROR_MESSAGE,
    recoveryRequired: false,
    sourceJson,
  });
  const stored = readBranchMoveIndex(storage);
  if (
    stored === null
    || encodeMapIndex(stored.index) !== encodeMapIndex(index)
    || sourceId === newMapId
    || index.currentMapId !== sourceId
    || findMapEntry(index, sourceId) === null
    || findMapEntry(index, newMapId) !== null
    || !Number.isFinite(now.getTime())
  ) {
    return failed();
  }

  const documents = readExtractDocuments(storage, sourceId, index);
  if (!documents.ok) return failed(documents.sourceJson);

  const emptyTarget: NodeMapState = { layoutMode: documents.source.layoutMode, nodes: [] };
  const extracted = extractBranchToNewMap({
    source: documents.source,
    target: emptyTarget,
    rootId,
    newMapId,
    sourceMapId: sourceId,
    sourceMapName: documents.sourceMapName,
    allocateIds: createNodeIdAllocator().nextAvailableEntityIds,
  });
  if (!extracted.ok) return failed(documents.sourceJson);

  const nowIso = now.toISOString();
  const withNew = addMapEntry(
    index,
    createMapIndexEntry(newMapId, extracted.newMapName, nowIso),
  );
  const next = openMapAfterBranchTransfer(withNew, sourceId, newMapId, nowIso);
  const written = writeBranchMove(storage, {
    sourceId,
    targetId: newMapId,
    sourceBefore: documents.sourceJson,
    targetBefore: null,
    indexBefore: stored.raw,
    sourceAfter: serializeMapDocument(createMapDocument(
      extracted.source.nodes,
      extracted.source.layoutMode,
      mapDocumentOptionsFromState(extracted.source),
    )),
    targetAfter: serializeMapDocument(createMapDocument(
      extracted.target.nodes,
      extracted.target.layoutMode,
      mapDocumentOptionsForNewMap(extracted.target),
    )),
    indexAfter: encodeMapIndex(next),
  });
  if (written.ok) {
    return { ok: true, index: next, newMapId, stubNodeId: extracted.stubNodeId };
  }
  return {
    ok: false,
    error: written.error,
    recoveryRequired: written.recoveryRequired,
    sourceJson: documents.sourceJson,
  };
}