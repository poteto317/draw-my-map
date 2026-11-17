import type { NodeImportance } from "@/types/nodeImportance";

// マップのノード。属性を足すときは、ノードの分割・統合での扱いを決めて見直す
// （domain/nodes/nodeSplit.ts の断片のノード、domain/nodes/nodeMerge.ts の applyPlanToSurvivor・planNodeMerge・isSameNodeMergePlan）。
// 任意の属性を足したら、domain/nodes/nodeAttributePolicy.ts の表（NODE_ATTRIBUTE_POLICY）と、
// domain/nodes/__tests__/nodeAttributePolicy.test.ts の見本（SAMPLE・DIFFERENT。全属性の往復と比較の検査）も更新する
// （足し忘れると型エラーになる。L-825）。
// 属性を値のまま写している次の場所も見直す: 枝の複製・コピー＆ペースト（domain/nodes/nodeSubtreeInsertion.ts の `...source`）、
// 保存形式の書き出しと検証（domain/persistence/mapDocumentNodeProjection.ts・mapDocumentNode.ts。
// コピー＆ペーストのクリップボードの形式も mapDocumentNode.ts を使う）、マップの競合判定（domain/mapLibrary/mapConflict.ts の
// areNodesEqual。項目を並べて比べている）、編集履歴の同値判定（domain/history/mapHistory.ts の areNodesEqual。配列の値は
// 要素ごとに比べる）、親の挿入（domain/nodes/nodePlacement.ts の createParentNode）、検索（domain/search/nodeLabelSearch.ts）、
// キャンバスの描画（components/map/pixi/renderMapNodes.ts）、アウトライン書き出し・画像書き出し
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
  // 添付した URL（正規化した http/https の URL.href。最大 domain/nodes/nodeLink.ts の NODE_LINKS_MAX_COUNT 件、重複なし）。
  // 読み取り専用の配列で、書き換えずに作り直す。無いノードでは、項目ごと持たない（空配列も持たない）。
  // 更新は domain/nodes/nodeLink.ts の addNodeLink・removeNodeLink。分割では元のノードにだけ残し、統合では選択中の URL を
  // 配列順に重複を除いて連結し、複製・貼り付け・別マップへの移動では写し、親の挿入では新しい親に持たせない
  links?: readonly string[];
  // タグ（domain/nodes/nodeTag.ts の normalizeNodeTagName で正規化した名前。最大 NODE_TAGS_MAX_COUNT 件、各
  // NODE_TAG_MAX_LENGTH 文字。nodeTagKey（U+200D・U+FE0E・U+FE0F の除去 → NFKC → 小文字化）が同じものは持たない。表記は最初に入力したもの）。
  // 読み取り専用の配列で、書き換えずに作り直す。無いノードでは、項目ごと持たない（空配列も持たない）。
  // 更新は domain/nodes/nodeTag.ts の addNodeTag・removeNodeTag。分割では元のノードにだけ残し、統合では選択中のタグを
  // 配列順に同じタグとみなすものを除いて連結し、複製・貼り付け・別マップへの移動では写し、親の挿入では新しい親に持たせない。
  // 今は検索（domain/search/nodeLabelSearch.ts）・キャンバスの描画（components/map/pixi/renderMapNodes.ts）・アウトライン書き出し・画像書き出しに
  // 使っていない。使うときは、それらと nodeTagKey の規則をそろえる（NFKC と小文字化はノード検索の normalizeNodeSearchText と同じ。nodeTagKey はさらに、NFKC の前に U+200D・U+FE0E・U+FE0F を除く）
  tags?: readonly string[];
};
