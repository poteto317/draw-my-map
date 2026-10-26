import {
  resolveSiblingReorderShortcut,
  type SiblingReorderShortcutInput,
} from "@/components/map/siblingReorderShortcut";
import { buttonInsideMarkedElement, insideOf } from "@/components/map/testing/treeEditShortcutTargets";
import { TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE } from "@/components/map/treeEditShortcutGuard";

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
    ["目印の無い button の内側", { target: insideOf("button") }],
    ["目印付きの要素の内側にある、目印の無い button", { target: buttonInsideMarkedElement() }],
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

  describe("「上へ」「下へ」ボタンにフォーカスがあるとき", () => {
    const markedButton = () => insideOf("button", { [TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE]: "" });

    it("ボタンそのものへの Alt+ArrowUp / Alt+ArrowDown は働く", () => {
      const button = document.createElement("button");
      button.setAttribute(TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE, "");
      expect(resolveSiblingReorderShortcut({ ...baseInput, target: button })).toBe("up");
      expect(resolveSiblingReorderShortcut({ ...baseInput, key: "ArrowDown", keyCode: 40, target: button })).toBe("down");
    });

    it("ボタンの内側の要素への Alt+ArrowDown も働く", () => {
      expect(resolveSiblingReorderShortcut({ ...baseInput, key: "ArrowDown", keyCode: 40, target: markedButton() }))
        .toBe("down");
    });

    it.each<[string, Partial<SiblingReorderShortcutInput>]>([
      ["ctrlKey 併用", { ctrlKey: true }],
      ["metaKey 併用", { metaKey: true }],
      ["shiftKey 併用", { shiftKey: true }],
      ["isComposing", { isComposing: true }],
      ["keyCode 229", { keyCode: 229 }],
      ["defaultPrevented", { defaultPrevented: true }],
      ["編集中", { isEditing: true }],
      ["ジェスチャー中", { hasActiveGesture: true }],
    ])("%s は null", (_name, override) => {
      expect(resolveSiblingReorderShortcut({ ...baseInput, target: markedButton(), ...override })).toBeNull();
    });
  });
});
