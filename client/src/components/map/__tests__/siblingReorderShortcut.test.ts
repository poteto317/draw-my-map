import {
  resolveSiblingReorderShortcut,
  type SiblingReorderShortcutInput,
} from "@/components/map/siblingReorderShortcut";

const baseInput: SiblingReorderShortcutInput = {
  key: "ArrowUp",
  altKey: true,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  isComposing: false,
  keyCode: 38,
  defaultPrevented: false,
  target: document.body,
  isEditing: false,
  selectedNodeId: 1,
  hasActiveGesture: false,
};

function insideOf(tag: string, attributes: Record<string, string> = {}): HTMLElement {
  const outer = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) outer.setAttribute(name, value);
  const inner = document.createElement("span");
  outer.appendChild(inner);
  return inner;
}

describe("resolveSiblingReorderShortcut", () => {
  it("Alt+ArrowUp は up", () => {
    expect(resolveSiblingReorderShortcut(baseInput)).toBe("up");
  });

  it("Alt+ArrowDown は down", () => {
    expect(resolveSiblingReorderShortcut({ ...baseInput, key: "ArrowDown", keyCode: 40 })).toBe("down");
  });

  it.each<[string, Partial<SiblingReorderShortcutInput>]>([
    ["altKey なし", { altKey: false }],
    ["ctrlKey 併用", { ctrlKey: true }],
    ["metaKey 併用", { metaKey: true }],
    ["shiftKey 併用", { shiftKey: true }],
    ["isComposing", { isComposing: true }],
    ["keyCode 229", { keyCode: 229 }],
    ["defaultPrevented", { defaultPrevented: true }],
    ["編集中", { isEditing: true }],
    ["選択なし", { selectedNodeId: null }],
    ["ジェスチャー中", { hasActiveGesture: true }],
    ["button の内側", { target: insideOf("button") }],
    ["input の内側", { target: insideOf("input") }],
    ["textarea の内側", { target: insideOf("textarea") }],
    ["select の内側", { target: insideOf("select") }],
    ["a[href] の内側", { target: insideOf("a", { href: "#" }) }],
    ["contenteditable の内側", { target: insideOf("div", { contenteditable: "" }) }],
    ["ArrowLeft", { key: "ArrowLeft", keyCode: 37 }],
    ["ArrowRight", { key: "ArrowRight", keyCode: 39 }],
    ["Up", { key: "Up" }],
  ])("%s は null", (_name, override) => {
    expect(resolveSiblingReorderShortcut({ ...baseInput, ...override })).toBeNull();
  });
});
