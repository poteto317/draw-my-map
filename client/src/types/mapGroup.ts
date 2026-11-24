/** ノード集合のグループ枠（NodeMapState.groups）。id は nodes∪relations∪groups 共有空間 */
export type MapGroup = {
  id: number;
  /** 重複無し・2 件以上・存在するノードのみ（正規化時に不正は除去） */
  nodeIds: readonly number[];
  /** 空文字可。表示フォールバック「グループ」は UI のみ（永続しない） */
  label: string;
};

/** 超過ラベルは切り詰めず不正エントリとして除去（codec） */
export const MAP_GROUP_LABEL_MAX_CODEPOINTS = 100;
