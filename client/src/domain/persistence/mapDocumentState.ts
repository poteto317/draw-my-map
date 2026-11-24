import type { MapDocumentV3 } from "@/types/mapDocument";
import type { NodeMapState } from "@/types/nodeMapState";

// MapDocumentV3 から履歴・UI 用の NodeMapState へ（version は落とす）
export function nodeMapStateFromDocument(document: MapDocumentV3): NodeMapState {
  return {
    layoutMode: document.layoutMode,
    nodes: document.nodes,
    ...(document.treeDirection === undefined ? {} : { treeDirection: document.treeDirection }),
    ...(document.layoutSpacing === undefined ? {} : { layoutSpacing: document.layoutSpacing }),
    ...(document.relations === undefined ? {} : { relations: document.relations }),
    ...(document.groups === undefined ? {} : { groups: document.groups }),
  };
}

export function mapDocumentOptionsFromState(
  state: Pick<NodeMapState, "treeDirection" | "layoutSpacing" | "relations" | "groups">,
): Pick<MapDocumentV3, "treeDirection" | "layoutSpacing" | "relations" | "groups"> {
  return {
    treeDirection: state.treeDirection,
    layoutSpacing: state.layoutSpacing,
    relations: state.relations,
    groups: state.groups,
  };
}
