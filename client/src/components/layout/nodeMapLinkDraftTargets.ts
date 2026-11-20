import type { CrossMapCorpus } from "@/domain/mapLibrary/crossMapCorpus";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import type { Node } from "@/types/node";

export type NodeMapLinkDraftTargetsInput = {
  readonly maps: readonly MapIndexEntry[];
  readonly corpus: CrossMapCorpus;
  readonly currentMapId: string;
  readonly selectedNodeId: number | null;
  readonly draftTargetMapId: string;
  readonly draftTargetNodeId: string; // "" はマップ全体
};

export type NodeMapLinkDraftTargets = {
  readonly targetMapId: string;
  readonly targetNodeId: string; // "" はマップ全体
  readonly isTargetMapUnreadable: boolean;
  readonly selectableNodes: readonly Node[];
};

const NO_NODES: readonly Node[] = [];

// 「マップ間リンク」節の下書き（対象マップ・対象ノード）を、今の一覧と corpus で選べる値へ正規化する。
// 一覧から消えたマップは先頭のマップへ、候補に無いノードはマップ全体へ戻す
export function resolveNodeMapLinkDraftTargets({
  maps,
  corpus,
  currentMapId,
  selectedNodeId,
  draftTargetMapId,
  draftTargetNodeId,
}: NodeMapLinkDraftTargetsInput): NodeMapLinkDraftTargets {
  const hasDraftTargetMap = maps.some((entry) => entry.id === draftTargetMapId);
  const targetMapId = hasDraftTargetMap ? draftTargetMapId : (maps[0]?.id ?? "");

  const isTargetMapUnreadable = corpus.unreadableMaps.some((info) => info.mapId === targetMapId);
  const readableMap = isTargetMapUnreadable
    ? undefined
    : corpus.readableMaps.find((snapshot) => snapshot.mapId === targetMapId);

  // 現在のマップでは選択中のノード自身を候補から除く
  const selectableNodes =
    readableMap === undefined
      ? NO_NODES
      : targetMapId === currentMapId && selectedNodeId !== null
        ? readableMap.nodes.filter((node) => node.id !== selectedNodeId)
        : readableMap.nodes;

  const targetNodeId =
    hasDraftTargetMap
    && !isTargetMapUnreadable
    && selectableNodes.some((node) => String(node.id) === draftTargetNodeId)
      ? draftTargetNodeId
      : "";

  return { targetMapId, targetNodeId, isTargetMapUnreadable, selectableNodes };
}
