/** キャンバス選択。relation / group 時はノード主選択をクリアする */
export type MapCanvasSelection =
  | { type: "nodes"; ids: readonly number[] }
  | { type: "relation"; id: number }
  | { type: "group"; id: number };
