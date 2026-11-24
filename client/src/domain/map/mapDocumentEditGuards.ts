import type { MapCanvasSelection } from "@/types/mapCanvasSelection";

/** 保護・競合・外部削除で文書編集を止める共通前提 */
export type DocumentEditGuardInput = {
  isProtectedMode: boolean;
  hasConflict: boolean;
  isExternallyDeleted: boolean;
};

export function isDocumentBlocked(input: DocumentEditGuardInput): boolean {
  return input.isProtectedMode || input.hasConflict || input.isExternallyDeleted;
}

/** 関連線／グループ選択中はノード対象操作を無効にする */
export function isNonNodeSelection(
  selection: MapCanvasSelection | null | undefined,
): boolean {
  return selection?.type === "relation" || selection?.type === "group";
}
