import { isEditableTarget } from "@/components/map/editableTarget";
import {
  passesTreeEditKeyGuard,
  passesTreeEditShortcutGuard,
  type TreeEditShortcutInput,
} from "@/components/map/treeEditShortcutGuard";
import type { NodeIndentDirection } from "@/domain/nodes/nodeIndent";

export function resolveNodeIndentShortcut(input: TreeEditShortcutInput): NodeIndentDirection | null {
  if (!passesTreeEditShortcutGuard(input)) return null;

  if (input.key === "ArrowRight") return "indent";
  if (input.key === "ArrowLeft") return "outdent";
  return null;
}

export type AltArrowNavigationInput = Pick<
  TreeEditShortcutInput,
  "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "isComposing" | "keyCode" | "defaultPrevented" | "target" | "isEditing"
>;

// Windows・Linux のブラウザの「戻る」「進む」（Alt+←/→）を止めるか。
// 選択・ジェスチャー・目印の無いボタンかどうかは見ない（入力欄の中だけブラウザに任せる）
export function shouldSuppressAltArrowNavigation(input: AltArrowNavigationInput): boolean {
  if (input.key !== "ArrowLeft" && input.key !== "ArrowRight") return false;
  if (!passesTreeEditKeyGuard(input)) return false;
  return !isEditableTarget(input.target);
}
