import { createMonotonicIdGenerator } from "@/domain/nodes/nodeIdGenerator";
import type { Node } from "@/types/node";

type NodeIdGenerator = () => number;
type NodeIdGeneratorFactory = () => NodeIdGenerator;

export type NodeIdAllocator = {
  nextAvailableId: (nodes: readonly Node[]) => number;
  nextAvailableIds: (nodes: readonly Node[], count: number) => number[];
  reset: () => void;
};

function createDefaultNodeIdGenerator(): NodeIdGenerator {
  return createMonotonicIdGenerator();
}

export function createNodeIdAllocator(
  createGenerator: NodeIdGeneratorFactory = createDefaultNodeIdGenerator,
): NodeIdAllocator {
  let generateNodeId = createGenerator();

  // 既存ノードと、同じ呼び出しで採番済みのIDとは衝突させない。単数・複数の採番で同じ規則を使う
  function nextAvailableIds(nodes: readonly Node[], count: number): number[] {
    const occupiedIds = new Set(nodes.map((node) => node.id));
    const ids: number[] = [];
    while (ids.length < count) {
      const id = generateNodeId();
      if (occupiedIds.has(id)) continue;
      occupiedIds.add(id);
      ids.push(id);
    }
    return ids;
  }

  return {
    nextAvailableId(nodes) {
      return nextAvailableIds(nodes, 1)[0];
    },
    nextAvailableIds,
    reset() {
      generateNodeId = createGenerator();
    },
  };
}
