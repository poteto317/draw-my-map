import type { NodeImportance } from "@/types/nodeImportance";

// マップのノード。属性を足すときは、ノードの分割・統合での扱いを決めて見直す
// （domain/nodes/nodeSplit.ts の断片のノード、domain/nodes/nodeMerge.ts の applyPlanToSurvivor・planNodeMerge・isSameNodeMergePlan）。
// 属性を値のまま写している次の場所も見直す: 枝の複製・コピー＆ペースト（domain/nodes/nodeSubtreeInsertion.ts の `...source`）、
// 保存形式の書き出しと検証（domain/persistence/mapDocumentNodeProjection.ts・mapDocumentNode.ts。
// コピー＆ペーストのクリップボードの形式も mapDocumentNode.ts を使う）、マップの競合判定（domain/mapLibrary/mapConflict.ts の
// areNodesEqual。項目を並べて比べている）、親の挿入（domain/nodes/nodePlacement.ts の createParentNode）、各エクスポート
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
  // 詳細メモ（プレーンテキスト。上限は domain/nodes/nodeNote.ts の NODE_NOTE_MAX_LENGTH）。
  // 無いノード・空白だけのメモでは、項目ごと持たない。更新は domain/nodes/nodeNote.ts の replaceNodeNote。
  // 分割では元のノードにだけ残し、統合では選択中のメモを連結し、親の挿入では新しい親に持たせない
  note?: string;
};
