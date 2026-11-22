import type { LayoutSpacing } from "@/types/layoutSpacing";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { TreeDirection } from "@/types/treeDirection";

export type NodeMapState = {
  layoutMode: NodeLayoutMode;
  nodes: Node[];
  // 自動レイアウトのツリー方向。無いときは lr
  treeDirection?: TreeDirection;
  // 自動レイアウトの間隔。無いときは config/shapes.ts の既定値
  layoutSpacing?: LayoutSpacing;
};
