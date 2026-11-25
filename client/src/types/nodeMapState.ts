import type { BranchLayout } from "@/types/branchLayout";
import type { LayoutSpacing } from "@/types/layoutSpacing";
import type { LayoutStyle } from "@/types/layoutStyle";
import type { MapGroup } from "@/types/mapGroup";
import type { MapRelation } from "@/types/mapRelation";
import type { MapTour } from "@/types/mapTour";
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
  // レイアウト様式。欠落キー＝orthogonal。orthogonal はエンコード時にキー省略
  layoutStyle?: LayoutStyle;
  // 枝ごとの配置方向。欠落キー＝空。空配列はエンコード時にキー省略
  branchLayouts?: readonly BranchLayout[];
  // 親子以外の関連線。欠落キー＝空。空配列はエンコード時にキー省略
  relations?: readonly MapRelation[];
  // ノード集合のグループ枠。欠落キー＝空。空配列はエンコード時にキー省略
  groups?: readonly MapGroup[];
  // プレゼンテーションツアー（Phase 31・072/073）。欠落キー＝ツアーなし。steps が空の下書きは永続化時にキー省略（`types/mapTour.ts` の `normalizeTour` / `projectTour`）
  tour?: MapTour;
};
