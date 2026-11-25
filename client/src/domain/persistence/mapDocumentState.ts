import type { MapDocumentV3 } from "@/types/mapDocument";
import type { NodeMapState } from "@/types/nodeMapState";

// MapDocumentV3 から履歴・UI 用の NodeMapState へ（version は落とす）
export function nodeMapStateFromDocument(document: MapDocumentV3): NodeMapState {
  return {
    layoutMode: document.layoutMode,
    nodes: document.nodes,
    ...(document.treeDirection === undefined ? {} : { treeDirection: document.treeDirection }),
    ...(document.layoutSpacing === undefined ? {} : { layoutSpacing: document.layoutSpacing }),
    ...(document.layoutStyle === undefined ? {} : { layoutStyle: document.layoutStyle }),
    ...(document.branchLayouts === undefined ? {} : { branchLayouts: document.branchLayouts }),
    ...(document.relations === undefined ? {} : { relations: document.relations }),
    ...(document.groups === undefined ? {} : { groups: document.groups }),
    ...(document.tour === undefined ? {} : { tour: document.tour }),
  };
}

type MapDocumentStateFields = Pick<
  NodeMapState,
  "treeDirection" | "layoutSpacing" | "layoutStyle" | "branchLayouts" | "relations" | "groups" | "tour"
>;

type MapDocumentOptions = Pick<
  MapDocumentV3,
  "treeDirection" | "layoutSpacing" | "layoutStyle" | "branchLayouts" | "relations" | "groups" | "tour"
>;

function mapDocumentLayoutOptions(state: MapDocumentStateFields): Omit<MapDocumentOptions, "tour"> {
  return {
    treeDirection: state.treeDirection,
    layoutSpacing: state.layoutSpacing,
    layoutStyle: state.layoutStyle,
    branchLayouts: state.branchLayouts,
    relations: state.relations,
    groups: state.groups,
  };
}

export function mapDocumentOptionsFromState(state: MapDocumentStateFields): MapDocumentOptions {
  return {
    ...mapDocumentLayoutOptions(state),
    tour: state.tour,
  };
}

/** §3.2: 別名保存・新規作成・テンプレ新規・枝切り出し先では tour を含めない */
export function mapDocumentOptionsForNewMap(state: MapDocumentStateFields): Omit<MapDocumentOptions, "tour"> {
  return mapDocumentLayoutOptions(state);
}

export function omitTourFromMapDocument(document: MapDocumentV3): MapDocumentV3 {
  const rest = { ...document };
  delete rest.tour;
  return rest;
}
