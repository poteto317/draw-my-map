/** comment リンクのときだけ渡す、ノードの件数と選択（view リンクでは null） */
export type ShareCommentTarget = {
  /** ノードごとの未解決スレッド数。0 のノードはキーを持たない */
  readonly counts: ReadonlyMap<number, number>;
  readonly selectedNodeId: number | null;
  readonly onSelectNode: (nodeId: number) => void;
};
