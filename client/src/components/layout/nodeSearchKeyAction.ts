export type NodeSearchKeyAction =
  | "open"
  | "next"
  | "previous"
  | "select"
  | "close"
  | "clear"
  | "prevent";

type ResolveNodeSearchKeyActionInput = {
  key: string;
  isComposing: boolean;
  keyCode: number;
  repeat: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  isOpen: boolean;
  hasQuery: boolean;
  hasResults: boolean;
};

export function resolveNodeSearchKeyAction({
  key,
  isComposing,
  keyCode,
  repeat,
  ctrlKey,
  metaKey,
  altKey,
  isOpen,
  hasQuery,
  hasResults,
}: ResolveNodeSearchKeyActionInput): NodeSearchKeyAction | null {
  if (isComposing || keyCode === 229 || ctrlKey || metaKey || altKey) {
    return null;
  }

  if (key === "ArrowDown") {
    if (!isOpen && hasQuery) return "open";
    if (isOpen && hasResults) return "next";
    return null;
  }
  if (key === "ArrowUp") {
    return isOpen && hasResults ? "previous" : null;
  }
  if (key === "Enter") {
    if (repeat) return null;
    return isOpen && hasResults ? "select" : "prevent";
  }
  if (key === "Escape") {
    if (isOpen) return "close";
    if (hasQuery) return "clear";
  }

  return null;
}
