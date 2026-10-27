import {
  passesTreeEditShortcutGuard,
  type TreeEditShortcutInput,
} from "@/components/map/treeEditShortcutGuard";

export type NodeParentInsertionShortcutInput = TreeEditShortcutInput & { repeat: boolean };

// insert: 親ノードを挿入する。suppress: 押し続けなので挿入せず、既定動作だけ止める
export type NodeParentInsertionShortcutAction = "insert" | "suppress";

export function resolveNodeParentInsertionShortcut(
  input: NodeParentInsertionShortcutInput,
): NodeParentInsertionShortcutAction | null {
  if (!passesTreeEditShortcutGuard(input)) return null;
  if (input.key !== "Enter") return null;
  return input.repeat ? "suppress" : "insert";
}
