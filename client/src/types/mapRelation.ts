/** 関連線の意味。UI ラベルは relationKindLabels（依存 / 対立 / 参考 / 関連） */
export type RelationKind = "dependency" | "conflict" | "reference" | "related";

/** 親子以外の関連線（NodeMapState.relations）。id は nodes∪relations∪groups 共有空間 */
export type MapRelation = {
  id: number;
  fromId: number;
  toId: number;
  kind: RelationKind;
  /** true = from→to 矢印、false = 無向 */
  directed: boolean;
};

export const RELATION_KINDS: readonly RelationKind[] = [
  "dependency",
  "conflict",
  "reference",
  "related",
];
