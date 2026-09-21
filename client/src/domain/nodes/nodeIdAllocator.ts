import { createMonotonicIdGenerator } from "@/domain/nodes/nodeIdGenerator";
import type { Node } from "@/types/node";

type NodeIdGenerator = () => number;
type NodeIdGeneratorFactory = () => NodeIdGenerator;

export type NodeIdAllocator = {
  nextAvailableId: (nodes: readonly Node[]) => number;
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
    reset() {
      generateNodeId = createGenerator();
    },
  };
}
