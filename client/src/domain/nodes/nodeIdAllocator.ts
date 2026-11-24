import { collectUsedEntityIds } from "@/domain/map/relationGroupModel";
import { createMonotonicIdGenerator } from "@/domain/nodes/nodeIdGenerator";
import type { Node } from "@/types/node";
import type { NodeMapState } from "@/types/nodeMapState";

type NodeIdGenerator = () => number;
type NodeIdGeneratorFactory = () => NodeIdGenerator;

export type NodeIdAllocator = {
  nextAvailableId: (nodes: readonly Node[]) => number;
  nextAvailableIds: (nodes: readonly Node[], count: number) => number[];
  // nodes ∪ relations ∪ groups の共有 ID 空間で採番する（既存 nextAvailableIds は壊さない）
  nextAvailableEntityIds: (
    state: Pick<NodeMapState, "nodes" | "relations" | "groups">,
    count: number,
  ) => number[];
  reset: () => void;
};

function createDefaultNodeIdGenerator(): NodeIdGenerator {
  return createMonotonicIdGenerator();
}

function nextIdsFromOccupied(
  generateNodeId: NodeIdGenerator,
  occupiedIds: Set<number>,
  count: number,
): number[] {
  const ids: number[] = [];
  while (ids.length < count) {
    const id = generateNodeId();
    if (occupiedIds.has(id)) continue;
    occupiedIds.add(id);
    ids.push(id);
  }
  return ids;
}

export function createNodeIdAllocator(
  createGenerator: NodeIdGeneratorFactory = createDefaultNodeIdGenerator,
): NodeIdAllocator {
  let generateNodeId = createGenerator();

  // 既存ノードと、同じ呼び出しで採番済みのIDとは衝突させない。単数・複数の採番で同じ規則を使う
  function nextAvailableIds(nodes: readonly Node[], count: number): number[] {
    return nextIdsFromOccupied(generateNodeId, new Set(nodes.map((node) => node.id)), count);
  }

  function nextAvailableEntityIds(
    state: Pick<NodeMapState, "nodes" | "relations" | "groups">,
    count: number,
  ): number[] {
    return nextIdsFromOccupied(generateNodeId, new Set(collectUsedEntityIds(state)), count);
  }

  return {
    nextAvailableId(nodes) {
      return nextAvailableIds(nodes, 1)[0];
    },
    nextAvailableIds,
    nextAvailableEntityIds,
    reset() {
      generateNodeId = createGenerator();
    },
  };
}
