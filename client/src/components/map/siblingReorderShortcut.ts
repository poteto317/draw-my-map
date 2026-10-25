import { isInteractiveTarget } from "@/components/map/interactiveTarget";
import type { SiblingReorderDirection } from "@/domain/nodes/nodeSiblingOrder";

export type SiblingReorderShortcutInput = {
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

const IME_PROCESSING_KEY_CODE = 229;

// ヘッダーの「上へ」「下へ」ボタンに付ける目印。このボタンはショートカットを案内しているので、
// フォーカスがあっても Alt+↑/↓ を止めない
export const SIBLING_REORDER_BUTTON_ATTRIBUTE = "data-sibling-reorder-button";

// 目印はボタン自身に付いている必要がある。目印付きの要素の中にある別のボタンは対象外
const isSiblingReorderButtonTarget = (target: EventTarget | null): boolean => (
  target instanceof HTMLElement
  && target.closest("button")?.hasAttribute(SIBLING_REORDER_BUTTON_ATTRIBUTE) === true
);

export function resolveSiblingReorderShortcut(
  input: SiblingReorderShortcutInput,
): SiblingReorderDirection | null {
  if (input.defaultPrevented) return null;
  if (input.isComposing || input.keyCode === IME_PROCESSING_KEY_CODE) return null;
  if (!input.altKey || input.ctrlKey || input.metaKey || input.shiftKey) return null;
  if (input.isEditing) return null;
  if (isInteractiveTarget(input.target) && !isSiblingReorderButtonTarget(input.target)) return null;
  if (input.selectedNodeId === null || input.hasActiveGesture) return null;

  if (input.key === "ArrowUp") return "up";
  if (input.key === "ArrowDown") return "down";
  return null;
}
