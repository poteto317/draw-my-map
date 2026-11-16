export type NodeSeparatorPreset = { id: string; label: string; value: string };

// 分割・統合のダイアログが共有する区切り文字の選択肢（プルダウンの並び順）。一致は完全一致の文字列で、正規化しない
export const NODE_SEPARATOR_PRESETS: readonly NodeSeparatorPreset[] = [
  { id: "ja-comma", label: "、", value: "、" },
  { id: "comma", label: ",", value: "," },
  { id: "slash", label: "/", value: "/" },
  { id: "middle-dot", label: "・", value: "・" },
  { id: "space", label: "半角スペース", value: " " },
];

// 「その他」（文字列を入力する）を表すプリセットの id と表示名
export const NODE_SEPARATOR_CUSTOM_ID = "custom";
export const NODE_SEPARATOR_CUSTOM_LABEL = "その他";

export const SPLIT_DEFAULT_SEPARATOR = "、";
export const MERGE_DEFAULT_SEPARATOR = " ";

// 区切り文字に完全一致するプリセットの id。無ければ「その他」
export function findSeparatorPresetId(separator: string): string {
  return NODE_SEPARATOR_PRESETS.find((preset) => preset.value === separator)?.id ?? NODE_SEPARATOR_CUSTOM_ID;
}

// 選ばれたプリセットと入力欄から区切り文字を決める。知らない id は空文字（分割では「区切り文字が空」で失敗する）
export function resolveSeparator(presetId: string, customSeparator: string): string {
  if (presetId === NODE_SEPARATOR_CUSTOM_ID) return customSeparator;
  return NODE_SEPARATOR_PRESETS.find((preset) => preset.id === presetId)?.value ?? "";
}
