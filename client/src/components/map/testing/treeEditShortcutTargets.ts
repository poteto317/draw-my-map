import { TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE } from "@/components/map/treeEditShortcutGuard";

// 兄弟の順序と階層のショートカットの判定（共通ガードの target の条件）を確かめるための、キー入力の送り先の要素

// tag の要素（attributes を付ける）の内側にある span
export function insideOf(tag: string, attributes: Record<string, string> = {}): HTMLElement {
  const outer = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) outer.setAttribute(name, value);
  const inner = document.createElement("span");
  outer.appendChild(inner);
  return inner;
}

// 目印を付けた div の中にある普通のボタン。目印はボタン自身に付いていないので止める
export function buttonInsideMarkedElement(): HTMLElement {
  const outer = document.createElement("div");
  outer.setAttribute(TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE, "");
  const button = document.createElement("button");
  outer.appendChild(button);
  return button;
}
