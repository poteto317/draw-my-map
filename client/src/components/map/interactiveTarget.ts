// ボタン・入力欄・リンク・contenteditable など、自分でキーを扱う対話要素の内側か
export const isInteractiveTarget = (target: EventTarget | null): boolean => (
  target instanceof HTMLElement
  && Boolean(target.closest("button, input, textarea, select, a[href], [contenteditable]"))
);
