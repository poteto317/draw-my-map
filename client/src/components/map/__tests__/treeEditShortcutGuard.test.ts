import { buttonInsideMarkedElement, insideOf } from "@/components/map/testing/treeEditShortcutTargets";
import {
  TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE,
  createTreeEditShortcutInput,
  passesTreeEditKeyGuard,
  passesTreeEditShortcutGuard,
  type TreeEditKeyGuardInput,
  type TreeEditShortcutInput,
} from "@/components/map/treeEditShortcutGuard";

const baseInput: TreeEditShortcutInput = {
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

describe("TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE", () => {
  it("属性名は data-tree-edit-shortcut-button", () => {
    expect(TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE).toBe("data-tree-edit-shortcut-button");
  });
});

describe("passesTreeEditShortcutGuard", () => {
  it("基準の入力は true", () => {
    expect(passesTreeEditShortcutGuard(baseInput)).toBe(true);
  });

  it.each<[string, Partial<TreeEditShortcutInput>]>([
    ["既定動作が止められている", { defaultPrevented: true }],
    ["IME 変換中 (isComposing)", { isComposing: true }],
    ["IME 変換中 (keyCode 229)", { keyCode: 229 }],
    ["Alt が無い", { altKey: false }],
    ["Ctrl 付き", { ctrlKey: true }],
    ["Meta 付き", { metaKey: true }],
    ["Shift 付き", { shiftKey: true }],
    ["ラベル編集中", { isEditing: true }],
    ["目印の無い button", { target: insideOf("button") }],
    ["input", { target: insideOf("input") }],
    ["textarea", { target: insideOf("textarea") }],
    ["select", { target: insideOf("select") }],
    ["a[href]", { target: insideOf("a", { href: "/x" }) }],
    ["[contenteditable]", { target: insideOf("div", { contenteditable: "true" }) }],
    ["目印付きの要素の中の目印の無い button", { target: buttonInsideMarkedElement() }],
    ["選択が無い", { selectedNodeId: null }],
    ["ジェスチャー中", { hasActiveGesture: true }],
  ])("%s は false", (_name, override) => {
    expect(passesTreeEditShortcutGuard({ ...baseInput, ...override })).toBe(false);
  });

  it("目印付きの button と、その内側の要素は true", () => {
    const button = document.createElement("button");
    button.setAttribute(TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE, "");
    const inner = document.createElement("span");
    button.appendChild(inner);
    expect(passesTreeEditShortcutGuard({ ...baseInput, target: button })).toBe(true);
    expect(passesTreeEditShortcutGuard({ ...baseInput, target: inner })).toBe(true);
  });

  it.each(["ArrowLeft", "x"])("キーは見ない: %s でも true", (key) => {
    expect(passesTreeEditShortcutGuard({ ...baseInput, key })).toBe(true);
  });
});

describe("passesTreeEditKeyGuard", () => {
  const keyInput: TreeEditKeyGuardInput = {
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    keyCode: 38,
    defaultPrevented: false,
    isEditing: false,
  };

  it("基準の入力は true", () => {
    expect(passesTreeEditKeyGuard(keyInput)).toBe(true);
  });

  it.each<[string, Partial<TreeEditKeyGuardInput>]>([
    ["既定動作が止められている", { defaultPrevented: true }],
    ["isComposing", { isComposing: true }],
    ["keyCode 229", { keyCode: 229 }],
    ["Alt が無い", { altKey: false }],
    ["Ctrl 付き", { ctrlKey: true }],
    ["Meta 付き", { metaKey: true }],
    ["Shift 付き", { shiftKey: true }],
    ["ラベル編集中", { isEditing: true }],
  ])("%s は false", (_name, override) => {
    expect(passesTreeEditKeyGuard({ ...keyInput, ...override })).toBe(false);
  });
});

describe("createTreeEditShortcutInput", () => {
  // 真偽値の8項目には、4回の組み合わせで互いに異なる値の並びを割り当てる。
  // どの2項目を取り違えても、いずれかの回で値が食い違って落ちる
  type BooleanFields = Pick<
    TreeEditShortcutInput,
    | "altKey"
    | "ctrlKey"
    | "metaKey"
    | "shiftKey"
    | "isComposing"
    | "defaultPrevented"
    | "isEditing"
    | "hasActiveGesture"
  >;
  it.each<[string, string, number, number | null, BooleanFields]>([
    ["ArrowLeft", "1回目", 37, 7, {
      altKey: false,
      ctrlKey: true,
      metaKey: false,
      shiftKey: true,
      isComposing: false,
      defaultPrevented: true,
      isEditing: false,
      hasActiveGesture: true,
    }],
    ["ArrowRight", "2回目", 39, 11, {
      altKey: false,
      ctrlKey: false,
      metaKey: true,
      shiftKey: true,
      isComposing: false,
      defaultPrevented: false,
      isEditing: true,
      hasActiveGesture: true,
    }],
    ["ArrowUp", "3回目", 38, 13, {
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      isComposing: true,
      defaultPrevented: true,
      isEditing: true,
      hasActiveGesture: true,
    }],
    ["ArrowDown", "4回目", 40, null, {
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      isComposing: false,
      defaultPrevented: false,
      isEditing: false,
      hasActiveGesture: false,
    }],
  ])("キーボードイベントの値と、呼び出し元の状態をまとめる（%s・%s）", (key, _name, keyCode, selectedNodeId, flags) => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    let captured: TreeEditShortcutInput | null = null;
    target.addEventListener("keydown", (event) => {
      if (flags.defaultPrevented) event.preventDefault();
      captured = createTreeEditShortcutInput(event, {
        isEditing: flags.isEditing,
        selectedNodeId,
        hasActiveGesture: flags.hasActiveGesture,
      });
    });
    target.dispatchEvent(new KeyboardEvent("keydown", {
      key,
      altKey: flags.altKey,
      ctrlKey: flags.ctrlKey,
      metaKey: flags.metaKey,
      shiftKey: flags.shiftKey,
      isComposing: flags.isComposing,
      keyCode,
      bubbles: true,
      cancelable: true,
    }));
    target.remove();

    expect(captured).toEqual({
      key,
      keyCode,
      target,
      selectedNodeId,
      ...flags,
    });
  });

});
