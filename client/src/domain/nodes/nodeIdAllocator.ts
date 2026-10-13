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

  return {
    nextAvailableId(nodes) {
      const occupiedIds = new Set(nodes.map((node) => node.id));
      let id = generateNodeId();
      while (occupiedIds.has(id)) id = generateNodeId();
      return id;
    },
    nextAvailableIds(nodes, count) {
      const occupiedIds = new Set(nodes.map((node) => node.id));
      const ids: number[] = [];
      while (ids.length < count) {
        const id = generateNodeId();
        if (!occupiedIds.has(id)) ids.push(id);
      }
      return ids;
    },
    reset() {
      generateNodeId = createGenerator();
    },
  };
}
