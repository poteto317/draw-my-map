import type { MapLibraryDialogFocusTarget } from "@/types/mapLibraryDialog";

// 一覧の画面で、フォーカスの戻し先にできるボタン
export type MapLibraryListButton = Exclude<
  MapLibraryDialogFocusTarget,
  { kind: "screenDefault" }
>;

type MapLibraryListButtonAttributes = {
  "data-map-id"?: string;
  "data-map-action": string;
};

// 一覧の画面が付ける属性と、ダイアログがフォーカス先を探すセレクタの対応をここだけで定める。
// 要素の参照ではなく属性で探すので、再描画や行の削除で要素が差し替わっても見失わない
export function mapLibraryListButtonAttributes(
  button: MapLibraryListButton,
): MapLibraryListButtonAttributes {
  return button.kind === "row"
    ? { "data-map-id": button.mapId, "data-map-action": button.action }
    : { "data-map-action": "create" };
}

export function mapLibraryListButtonSelector(button: MapLibraryListButton): string {
  // id は MAP_ID_PATTERN の文字だけなので、属性値へそのまま入れられる
  return Object.entries(mapLibraryListButtonAttributes(button))
    .map(([name, value]) => `[${name}="${value}"]`)
    .join("");
}
