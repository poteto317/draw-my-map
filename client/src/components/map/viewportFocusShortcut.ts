import type { ScreenSize } from "@/components/map/mapViewport";
import type { Node } from "@/types/node";

export type ViewportFocusRequest = {
  node: Node;
  screen: ScreenSize;
};

export type ViewportFocusShortcutInput = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
};

type ViewportFocusInput = ViewportFocusShortcutInput & {
  target: EventTarget | null;
  nodes: readonly Node[];
  selectedNodeId: number | null;
  isEditing: boolean;
  hasActiveGesture: boolean;
  screen: ScreenSize | null;
};

export function isViewportFocusShortcut({
  key,
  ctrlKey,
  metaKey,
  altKey,
}: ViewportFocusShortcutInput): boolean {
  return key.toLowerCase() === "f" && !ctrlKey && !metaKey && !altKey;
}

const parseContentEditable = (value: string): boolean | null => {
  const normalizedValue = value.trim().toLowerCase();
  if (normalizedValue === "false") return false;
  if (
    normalizedValue === ""
    || normalizedValue === "true"
    || normalizedValue === "plaintext-only"
  ) return true;
  return null;
};

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest("input, textarea, select")) return true;

  let element: HTMLElement | null = target;
  while (element) {
    const contentEditable = element.getAttribute("contenteditable");
    if (contentEditable !== null) {
      const parsedValue = parseContentEditable(contentEditable);
      if (parsedValue !== null) return parsedValue;
    }
    element = element.parentElement;
  }
  return false;
};

export function resolveViewportFocusRequest({
  key,
  ctrlKey,
  metaKey,
  altKey,
  target,
  nodes,
  selectedNodeId,
  isEditing,
  hasActiveGesture,
  screen,
}: ViewportFocusInput): ViewportFocusRequest | null {
  if (!isViewportFocusShortcut({ key, ctrlKey, metaKey, altKey })
    || isEditing
    || isEditableTarget(target)
    || hasActiveGesture
    || !screen
    || selectedNodeId === null) return null;

  const node = nodes.find((candidate) => candidate.id === selectedNodeId);
  return node ? { node, screen } : null;
}
