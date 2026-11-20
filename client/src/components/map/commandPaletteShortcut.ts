import { isEditableTarget } from "@/components/map/editableTarget";
import {
  hasSingleCommandModifier,
  isProcessableKeyEvent,
} from "@/components/map/mapHistoryShortcut";

export function isCommandPaletteShortcut(event: KeyboardEvent): boolean {
  if (!isProcessableKeyEvent(event) || !hasSingleCommandModifier(event)) return false;
  if (event.shiftKey) return false;
  if (event.key.toLowerCase() !== "k") return false;
  return !isEditableTarget(event.target);
}
