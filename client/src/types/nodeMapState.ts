import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

export type NodeMapState = {
  layoutMode: NodeLayoutMode;
  nodes: Node[];
};
