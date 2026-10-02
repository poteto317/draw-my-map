export const NODE_CONTEXT_MENU_ATTRIBUTE = "data-node-context-menu";

const NODE_CONTEXT_MENU_SELECTOR = `[${NODE_CONTEXT_MENU_ATTRIBUTE}]`;

export function isInsideNodeContextMenu(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(NODE_CONTEXT_MENU_SELECTOR) !== null;
}
