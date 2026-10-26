import { isInteractiveTarget } from "@/components/map/interactiveTarget";

const IME_PROCESSING_KEY_CODE = 229;

// 兄弟の順序と階層のボタンに付ける目印。このボタンはショートカットを案内しているので、
// フォーカスがあっても Alt+↑/↓/←/→ を止めない
export const TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE = "data-tree-edit-shortcut-button";

export type TreeEditShortcutInput = {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  isComposing: boolean;
  keyCode: number;
  defaultPrevented: boolean;
  target: EventTarget | null;
  isEditing: boolean;
  selectedNodeId: number | null;
  hasActiveGesture: boolean;
};

// キーボードイベントの値と、呼び出し元が持つ状態から、判定の入力を作る
export function createTreeEditShortcutInput(
  event: KeyboardEvent,
  state: Pick<TreeEditShortcutInput, "isEditing" | "selectedNodeId" | "hasActiveGesture">,
): TreeEditShortcutInput {
  return {
    key: event.key,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    isComposing: event.isComposing,
    keyCode: event.keyCode,
    defaultPrevented: event.defaultPrevented,
    target: event.target,
    isEditing: state.isEditing,
    selectedNodeId: state.selectedNodeId,
    hasActiveGesture: state.hasActiveGesture,
  };
}

// 条件 1〜4（既定動作が止められていない・IME でない・Alt だけ・ラベル編集中でない）。「戻る」「進む」の抑止と共有する
export type TreeEditKeyGuardInput = Pick<
  TreeEditShortcutInput,
  "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "isComposing" | "keyCode" | "defaultPrevented" | "isEditing"
>;

// 目印はボタン自身に付いている必要がある。目印付きの要素の中にある別のボタンは対象外
const isTreeEditShortcutButtonTarget = (target: EventTarget | null): boolean => (
  target instanceof HTMLElement
  && target.closest("button")?.hasAttribute(TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE) === true
);

export function passesTreeEditKeyGuard(input: TreeEditKeyGuardInput): boolean {
  if (input.defaultPrevented) return false;
  if (input.isComposing || input.keyCode === IME_PROCESSING_KEY_CODE) return false;
  if (!input.altKey || input.ctrlKey || input.metaKey || input.shiftKey) return false;
  if (input.isEditing) return false;
  return true;
}

// 条件 1〜7（キー以外のすべて）
export function passesTreeEditShortcutGuard(input: TreeEditShortcutInput): boolean {
  if (!passesTreeEditKeyGuard(input)) return false;
  if (isInteractiveTarget(input.target) && !isTreeEditShortcutButtonTarget(input.target)) return false;
  if (input.selectedNodeId === null || input.hasActiveGesture) return false;
  return true;
}
