// ノードへの要求（中央移動・ラベルの編集など）の共通の形。
// 受け取り側が sequence で処理済みかを見分け、documentRevision で古い要求を見分ける
export type RevisionScopedNodeRequest = {
  nodeId: number;
  sequence: number;
  documentRevision: number;
};
