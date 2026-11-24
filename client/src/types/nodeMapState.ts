import type { LayoutSpacing } from "@/types/layoutSpacing";
import type { MapGroup } from "@/types/mapGroup";
import type { MapRelation } from "@/types/mapRelation";
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
  // 親子以外の関連線。欠落キー＝空。空配列はエンコード時にキー省略
  relations?: readonly MapRelation[];
  // ノード集合のグループ枠。欠落キー＝空。空配列はエンコード時にキー省略
  groups?: readonly MapGroup[];
};
