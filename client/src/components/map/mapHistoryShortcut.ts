export type MapHistoryShortcut = "undo" | "redo";

// IME変換中のkeydownは、isComposingが立たないブラウザでもkeyCode 229になる
const IME_PROCESS_KEY_CODE = 229;

// 最も近いcontenteditable属性を持つ祖先で判定する。"false"なら編集領域の外として扱う
function isContentEditableTarget(element: Element): boolean {
  const editableRoot = element.closest("[contenteditable]");
  return editableRoot !== null
    && editableRoot.getAttribute("contenteditable")?.trim().toLowerCase() !== "false";
}

// 文字入力先ではブラウザ自身のUndo／Redoに任せる。ノード編集入力もinputとして含まれる
function isNativeEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest("input, textarea, select") !== null || isContentEditableTarget(target);
}

function isProcessableKeyEvent(event: KeyboardEvent): boolean {
  return !event.defaultPrevented
    && !event.repeat
    && !event.isComposing
    && event.keyCode !== IME_PROCESS_KEY_CODE
    && !event.altKey
    && !(event.ctrlKey && event.metaKey);
}

// マップの履歴ショートカットを判定する。対象外のキーや入力先ではnullを返す
export function resolveMapHistoryShortcut(event: KeyboardEvent): MapHistoryShortcut | null {
  if (!isProcessableKeyEvent(event)) return null;
  if (!event.ctrlKey && !event.metaKey) return null;

  const key = event.key.toLowerCase();
  let shortcut: MapHistoryShortcut | null = null;
  if (key === "z") shortcut = event.shiftKey ? "redo" : "undo";
  else if (key === "y" && event.ctrlKey && !event.shiftKey) shortcut = "redo";
  if (shortcut === null) return null;

  return isNativeEditingTarget(event.target) ? null : shortcut;
}
