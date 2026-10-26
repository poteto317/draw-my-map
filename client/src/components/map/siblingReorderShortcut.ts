import { passesTreeEditShortcutGuard, type TreeEditShortcutInput } from "@/components/map/treeEditShortcutGuard";
import type { SiblingReorderDirection } from "@/domain/nodes/nodeSiblingOrder";

export type SiblingReorderShortcutInput = TreeEditShortcutInput;

export function resolveSiblingReorderShortcut(
  input: SiblingReorderShortcutInput,
): SiblingReorderDirection | null {
  if (!passesTreeEditShortcutGuard(input)) return null;

  if (input.key === "ArrowUp") return "up";
  if (input.key === "ArrowDown") return "down";
  return null;
}
