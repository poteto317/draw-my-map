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

export function resolveSiblingReorderShortcut(
  input: SiblingReorderShortcutInput,
): SiblingReorderDirection | null {
  if (input.defaultPrevented) return null;
  if (input.isComposing || input.keyCode === IME_PROCESSING_KEY_CODE) return null;
  if (!input.altKey || input.ctrlKey || input.metaKey || input.shiftKey) return null;
  if (input.isEditing || isInteractiveTarget(input.target)) return null;
  if (input.selectedNodeId === null || input.hasActiveGesture) return null;

  if (input.key === "ArrowUp") return "up";
  if (input.key === "ArrowDown") return "down";
  return null;
}
