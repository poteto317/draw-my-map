import { isEditableTarget } from "@/components/map/editableTarget";

export type MapHistoryShortcut = "undo" | "redo";

// IME変換中のkeydownは、isComposingが立たないブラウザでもkeyCode 229になる
const IME_PROCESS_KEY_CODE = 229;

// IME変換中・キーリピート・処理済みのイベントは、キーの組み合わせによらず扱わない
function isProcessableKeyEvent(event: KeyboardEvent): boolean {
  return !event.defaultPrevented
    && !event.repeat
    && !event.isComposing
    && event.keyCode !== IME_PROCESS_KEY_CODE;
}

// 修飾キーはCtrlかCmdのどちらか一方だけを受け付け、Altとの組み合わせは扱わない
function hasSingleCommandModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey !== event.metaKey && !event.altKey;
}

// マップの履歴ショートカットを判定する。対象外のキーや入力先ではnullを返す
export function resolveMapHistoryShortcut(event: KeyboardEvent): MapHistoryShortcut | null {
  if (!isProcessableKeyEvent(event) || !hasSingleCommandModifier(event)) return null;

  const key = event.key.toLowerCase();
  let shortcut: MapHistoryShortcut | null = null;
  if (key === "z") shortcut = event.shiftKey ? "redo" : "undo";
  else if (key === "y" && event.ctrlKey && !event.shiftKey) shortcut = "redo";
  if (shortcut === null) return null;

  // 文字入力先ではブラウザ自身のUndo／Redoに任せる。ノード編集入力もinputとして含まれる
  return isEditableTarget(event.target) ? null : shortcut;
}
