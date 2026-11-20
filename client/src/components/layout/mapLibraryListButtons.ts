import type { MapLibraryDialogFocusTarget } from "@/types/mapLibraryDialog";

// 一覧の画面で、フォーカスの戻し先にできる作成・フォルダー管理・行ボタン
export type MapLibraryListButton = Extract<
  MapLibraryDialogFocusTarget,
  { kind: "listCreateButton" } | { kind: "folderButton" } | { kind: "row" }
>;

// フォルダー管理画面で、フォーカスの戻し先にできる入力欄・行ボタン
export type MapLibraryFolderTarget = Extract<
  MapLibraryDialogFocusTarget,
  { kind: "folderCreateInput" } | { kind: "folderRow" }
>;

type MapLibraryListButtonAttributes = {
  "data-map-id"?: string;
  "data-map-action": string;
};

type MapLibraryFolderTargetAttributes = {
  "data-folder-id"?: string;
  "data-folder-action": string;
};

// 一覧の画面が付ける属性と、ダイアログがフォーカス先を探すセレクタの対応をここだけで定める。
// 要素の参照ではなく属性で探すので、再描画や行の削除で要素が差し替わっても見失わない
export function mapLibraryListButtonAttributes(
  button: MapLibraryListButton,
): MapLibraryListButtonAttributes {
  switch (button.kind) {
    case "row":
      return { "data-map-id": button.mapId, "data-map-action": button.action };
    case "listCreateButton":
      return { "data-map-action": "create" };
    case "folderButton":
      return { "data-map-action": "folders" };
  }
}

// CSS 文字列リテラル（"..." 内）向けにバックスラッシュ・引用符・制御文字をエスケープする
function escapeCssStringValue(value: string): string {
  return value.replace(/[\\"\u0000-\u001f\u007f]/g, (char) => {
    if (char === "\\" || char === '"') return `\\${char}`;
    return `\\${(char.codePointAt(0) ?? 0).toString(16)} `;
  });
}

function buildAttributeSelector(attributes: Record<string, string | undefined>): string {
  return Object.entries(attributes)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([name, value]) => `[${name}="${escapeCssStringValue(value)}"]`)
    .join("");
}

export function mapLibraryListButtonSelector(button: MapLibraryListButton): string {
  return buildAttributeSelector(mapLibraryListButtonAttributes(button));
}

export function mapLibraryFolderTargetAttributes(
  target: MapLibraryFolderTarget,
): MapLibraryFolderTargetAttributes {
  return target.kind === "folderRow"
    ? { "data-folder-id": target.folderId, "data-folder-action": target.action }
    : { "data-folder-action": "create" };
}

export function mapLibraryFolderTargetSelector(target: MapLibraryFolderTarget): string {
  return buildAttributeSelector(mapLibraryFolderTargetAttributes(target));
}
