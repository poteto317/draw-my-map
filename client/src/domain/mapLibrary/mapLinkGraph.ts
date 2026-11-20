import type {
  CrossMapCorpus,
  UnreadableMapInfo,
} from "@/domain/mapLibrary/crossMapCorpus";
import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";
import type { Node, NodeMapLink } from "@/types/node";

export type ResolveNodeMapLinkOptions = {
  readonly storageMode?: "persistent" | "protected";
  readonly currentMapId?: string;
};

export type ResolvedNodeMapLink =
  | {
      readonly status: "valid";
      readonly link: NodeMapLink;
      readonly targetMapName: string;
      readonly targetNodeLabel?: string;
    }
  | {
      readonly status: "missing-map";
      readonly link: NodeMapLink;
    }
  | {
      readonly status: "missing-node";
      readonly link: NodeMapLink;
      readonly targetMapName: string;
    }
  | {
      readonly status: "unreadable-map";
      readonly link: NodeMapLink;
      readonly targetMapName: string;
    }
  | {
      readonly status: "protected-unavailable";
      readonly link: NodeMapLink;
    };

export type BacklinkItem = {
  readonly sourceMapId: string;
  readonly sourceMapName: string;
  readonly isCurrentMap: boolean;
  readonly sourceNodeId: number;
  readonly sourceNodeLabel: string;
  readonly matchScope: "node" | "map";
};

export type BacklinkCollectionResult = {
  readonly items: readonly BacklinkItem[];
  readonly unreadableMaps: readonly UnreadableMapInfo[];
};

export type BrokenMapLinkStatus =
  | "missing-map"
  | "missing-node"
  | "unreadable-map";

export type BrokenMapLinkItem = {
  readonly sourceMapId: string;
  readonly sourceMapName: string;
  readonly isCurrentMap: boolean;
  readonly sourceNodeId: number;
  readonly sourceNodeLabel: string;
  readonly link: NodeMapLink;
  readonly status: BrokenMapLinkStatus;
  readonly targetMapName?: string;
};

export type BrokenMapLinksResult = {
  readonly items: readonly BrokenMapLinkItem[];
  readonly unreadableMaps: readonly UnreadableMapInfo[];
};

type IndexedReadableMap = {
  readonly mapName: string;
  readonly nodesById: ReadonlyMap<number, Node>;
};

function resolveWithLookup(
  link: NodeMapLink,
  findReadableMap: (
    mapId: string,
  ) => { readonly mapName: string; findNode: (nodeId: number) => Node | undefined } | undefined,
  findUnreadableMap: (mapId: string) => UnreadableMapInfo | undefined,
  options?: ResolveNodeMapLinkOptions,
): ResolvedNodeMapLink {
  // 保護モードでは他マップを読めないため、リンク切れと混同せず専用ステータスを返す（L-002）
  if (
    options?.storageMode === "protected" &&
    options.currentMapId !== undefined &&
    link.targetMapId !== options.currentMapId
  ) {
    return { status: "protected-unavailable", link };
  }

  const readableMap = findReadableMap(link.targetMapId);
  if (readableMap !== undefined) {
    if (link.targetNodeId === undefined) {
      return {
        status: "valid",
        link,
        targetMapName: readableMap.mapName,
      };
    }
    const targetNode = readableMap.findNode(link.targetNodeId);
    if (targetNode !== undefined) {
      return {
        status: "valid",
        link,
        targetMapName: readableMap.mapName,
        targetNodeLabel: getNodeDisplayLabel(targetNode.label),
      };
    }
    return {
      status: "missing-node",
      link,
      targetMapName: readableMap.mapName,
    };
  }

  // 読込失敗・破損マップは targetNodeId の有無を問わず unreadable-map とする（L-002）
  const unreadableMap = findUnreadableMap(link.targetMapId);
  if (unreadableMap !== undefined) {
    return {
      status: "unreadable-map",
      link,
      targetMapName: unreadableMap.mapName,
    };
  }

  return { status: "missing-map", link };
}

export function resolveNodeMapLink(
  link: NodeMapLink,
  corpus: CrossMapCorpus,
  options?: ResolveNodeMapLinkOptions,
): ResolvedNodeMapLink {
  return resolveWithLookup(
    link,
    (mapId) => {
      const map = corpus.readableMaps.find((item) => item.mapId === mapId);
      if (map === undefined) return undefined;
      return {
        mapName: map.mapName,
        findNode: (nodeId) => map.nodes.find((node) => node.id === nodeId),
      };
    },
    (mapId) => corpus.unreadableMaps.find((item) => item.mapId === mapId),
    options,
  );
}

// 同一 (sourceMapId, sourceNodeId, matchScope) の衝突不能キー（L-539）
function backlinkDedupKey(
  sourceMapId: string,
  sourceNodeId: number,
  matchScope: "node" | "map",
): string {
  return `${sourceMapId}:${sourceNodeId}:${matchScope}`;
}

export function collectBacklinks(
  corpus: CrossMapCorpus,
  targetMapId: string,
  targetNodeId: number,
): BacklinkCollectionResult {
  const nodeItems: BacklinkItem[] = [];
  const mapItems: BacklinkItem[] = [];
  const seen = new Set<string>();

  for (const map of corpus.readableMaps) {
    for (const node of map.nodes) {
      const links = node.mapLinks;
      if (links === undefined || links.length === 0) continue;

      for (const link of links) {
        if (link.targetMapId !== targetMapId) continue;

        let matchScope: "node" | "map";
        if (link.targetNodeId === targetNodeId) {
          matchScope = "node";
        } else if (link.targetNodeId === undefined) {
          matchScope = "map";
        } else {
          continue;
        }

        const key = backlinkDedupKey(map.mapId, node.id, matchScope);
        if (seen.has(key)) continue;
        seen.add(key);

        const item: BacklinkItem = {
          sourceMapId: map.mapId,
          sourceMapName: map.mapName,
          isCurrentMap: map.isCurrent,
          sourceNodeId: node.id,
          sourceNodeLabel: getNodeDisplayLabel(node.label),
          matchScope,
        };
        if (matchScope === "node") {
          nodeItems.push(item);
        } else {
          mapItems.push(item);
        }
      }
    }
  }

  return {
    items: [...nodeItems, ...mapItems],
    unreadableMaps: corpus.unreadableMaps,
  };
}

export function collectBrokenMapLinks(
  corpus: CrossMapCorpus,
): BrokenMapLinksResult {
  const readableMapsById = new Map<string, IndexedReadableMap>();
  for (const map of corpus.readableMaps) {
    const nodesById = new Map<number, Node>();
    for (const node of map.nodes) {
      nodesById.set(node.id, node);
    }
    readableMapsById.set(map.mapId, { mapName: map.mapName, nodesById });
  }

  const unreadableMapsById = new Map<string, UnreadableMapInfo>();
  for (const info of corpus.unreadableMaps) {
    unreadableMapsById.set(info.mapId, info);
  }

  const findReadableMap = (mapId: string) => {
    const indexed = readableMapsById.get(mapId);
    if (indexed === undefined) return undefined;
    return {
      mapName: indexed.mapName,
      findNode: (nodeId: number) => indexed.nodesById.get(nodeId),
    };
  };
  const findUnreadableMap = (mapId: string) => unreadableMapsById.get(mapId);

  const items: BrokenMapLinkItem[] = [];

  for (const map of corpus.readableMaps) {
    for (const node of map.nodes) {
      const links = node.mapLinks;
      if (links === undefined || links.length === 0) continue;

      const sourceNodeLabel = getNodeDisplayLabel(node.label);
      for (const link of links) {
        const resolved = resolveWithLookup(
          link,
          findReadableMap,
          findUnreadableMap,
        );
        if (
          resolved.status === "valid" ||
          resolved.status === "protected-unavailable"
        ) {
          continue;
        }

        const baseItem = {
          sourceMapId: map.mapId,
          sourceMapName: map.mapName,
          isCurrentMap: map.isCurrent,
          sourceNodeId: node.id,
          sourceNodeLabel,
          link,
          status: resolved.status,
        };
        items.push(
          resolved.status === "missing-map"
            ? baseItem
            : { ...baseItem, targetMapName: resolved.targetMapName },
        );
      }
    }
  }

  return {
    items,
    unreadableMaps: corpus.unreadableMaps,
  };
}
