import type { NodeImportance } from "@/types/nodeImportance";

// マップのノード。属性を足すときは、ノードの分割・統合での扱いを決めて見直す
// （domain/nodes/nodeSplit.ts の断片のノード、domain/nodes/nodeMerge.ts の applyPlanToSurvivor・planNodeMerge・isSameNodeMergePlan）。
// 属性を値のまま写している次の場所も見直す: 枝の複製・コピー＆ペースト（domain/nodes/nodeSubtreeInsertion.ts の `...source`）、
// 保存形式の書き出しと検証（domain/persistence/mapDocumentNodeProjection.ts・mapDocumentNode.ts。
// コピー＆ペーストのクリップボードの形式も mapDocumentNode.ts を使う）、各エクスポート
export type Node = {
  id: number;
  parentId: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  importance: NodeImportance;
  // 縮小済みのイラストの data URL。無いノードでは、項目ごと持たない
  illustration?: string;
};
