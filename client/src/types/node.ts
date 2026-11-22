import type { NodeImportance } from "@/types/nodeImportance";

// マップのノード。属性を足すときは、ノードの分割・統合での扱いを決めて見直す
// （domain/nodes/nodeSplit.ts の断片のノード、domain/nodes/nodeMerge.ts の applyPlanToSurvivor・planNodeMerge・isSameNodeMergePlan）。
// 任意の属性を足したら、domain/nodes/nodeAttributePolicy.ts の表（NODE_ATTRIBUTE_POLICY）と、
// domain/nodes/__tests__/nodeAttributePolicy.test.ts の見本（SAMPLE・DIFFERENT。全属性の往復と比較の検査）も更新する
// （足し忘れると型エラーになる。L-825）。
// 属性を値のまま写している次の場所も見直す: 枝の複製・コピー＆ペースト（domain/nodes/nodeSubtreeInsertion.ts の `...source`）、
// 保存形式の書き出しと検証（domain/persistence/mapDocumentNodeProjection.ts・mapDocumentNode.ts。
// コピー＆ペーストのクリップボードの形式も mapDocumentNode.ts を使う）、マップの競合判定（domain/mapLibrary/mapConflict.ts の
// areNodesEqual。項目を並べて比べている）、編集履歴の同値判定（domain/history/mapHistory.ts の areNodesEqual。links・tags は
// 要素ごと ===、sources はオブジェクト要素なので areNodeSourcesEqual、mapLinks は areNodeMapLinksEqual）、親の挿入（domain/nodes/nodePlacement.ts の
// createParentNode）、検索（domain/search/nodeLabelSearch.ts）、
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
  // NODE_TAG_MAX_LENGTH 文字。nodeTagKey（U+200D・U+FE0E・U+FE0F の除去 → NFKC → 空白のまとめと trim → 小文字化 → NFKC）が同じものは持たない。表記は最初に入力したもの）。
  // 読み取り専用の配列で、書き換えずに作り直す。無いノードでは、項目ごと持たない（空配列も持たない）。
  // 更新は domain/nodes/nodeTag.ts の addNodeTag・removeNodeTag。分割では元のノードにだけ残し、統合では選択中のタグを
  // 配列順に同じタグとみなすものを除いて連結し、複製・貼り付け・別マップへの移動では写し、親の挿入では新しい親に持たせない。
  // 今は検索（domain/search/nodeLabelSearch.ts）・キャンバスの描画（components/map/pixi/renderMapNodes.ts）・アウトライン書き出し・画像書き出しに
  // 使っていない。使うときは、それらと nodeTagKey の規則をそろえる（NFKC と小文字化はノード検索の normalizeNodeSearchText と同じ。nodeTagKey はさらに、NFKC の前に U+200D・U+FE0E・U+FE0F を除き、NFKC の後に空白をまとめて trim し、小文字化の後にもう一度 NFKC をかける）
  tags?: readonly string[];
  // 出典（タイトル必須・ページ任意・URL 任意。domain/nodes/nodeSource.ts の normalizeNodeSource で正規化。
  // 最大 NODE_SOURCES_MAX_COUNT 件。nodeSourceKey（タイトルの鍵は nodeTagKey と同じ手順、ページ・URL は正規化値。無いときは空文字）が同じものは持たない）。
  // 読み取り専用の配列で、書き換えずに作り直す。無いノードでは、項目ごと持たない（空配列も持たない）。
  // 更新は domain/nodes/nodeSource.ts の addNodeSource・removeNodeSource（削除は index）。分割では元のノードにだけ残し、統合では選択中の出典を
  // 配列順に同じ出典とみなすものを除いて連結し、複製・貼り付け・別マップへの移動では写し、親の挿入では新しい親に持たせない。
  // 履歴の同値判定（domain/history/mapHistory.ts）は要素がオブジェクトなので areNodeSourcesEqual で比べる（links・tags の要素ごと === とは別）。
  // 今は検索（domain/search/nodeLabelSearch.ts）・キャンバスの描画（components/map/pixi/renderMapNodes.ts）・アウトライン書き出し・画像書き出しに
  // 使っていない。使うときは、それらと nodeSourceKey の規則をそろえる
  sources?: readonly NodeSource[];
  // マップ間リンク（targetMapId 必須・targetNodeId 任意。domain/nodes/nodeMapLink.ts の normalizeNodeMapLink で正規化。
  // 最大 NODE_MAP_LINKS_MAX_COUNT 件。nodeMapLinkKey が同じものは持たない）。
  // 読み取り専用の配列で、書き換えずに作り直す。無いノードでは、項目ごと持たない（空配列も持たない）。
  // 更新は domain/nodes/nodeMapLink.ts の addNodeMapLink・removeNodeMapLink（削除は値一致）。分割では元のノードにだけ残し、統合では選択中のマップ間リンクを
  // 配列順に同じリンクとみなすものを除いて連結し、複製・貼り付け・別マップへの移動では写し、親の挿入では新しい親に持たせない。
  // 履歴の同値判定（domain/history/mapHistory.ts）は要素がオブジェクトなので areNodeMapLinksEqual で比べる
  mapLinks?: readonly NodeMapLink[];
  // 編集ロック。値があるノードでは true のみキーを持つ
  locked?: true;
};

// 出典 1 件。任意の page / url は無いときキーごと持たない。規則は domain/nodes/nodeSource.ts
export type NodeSource = {
  title: string;
  page?: string;
  url?: string;
};

// マップ間リンク 1 件。任意の targetNodeId は無いときキーごと持たない。規則は domain/nodes/nodeMapLink.ts
export type NodeMapLink = {
  readonly targetMapId: string;
  readonly targetNodeId?: number;
};
