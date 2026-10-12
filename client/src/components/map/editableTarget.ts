// contenteditable属性値の解釈。不正値はnullを返し、祖先の設定を継承させる
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

// 文字入力先（input・textarea・select・contenteditable）か。ショートカットをブラウザ側に任せる判定に使う
export const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select")) return true;

  let element: Element | null = target;
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
