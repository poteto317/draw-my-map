import {
  resolveNodeIndentShortcut,
  shouldSuppressAltArrowNavigation,
  type AltArrowNavigationInput,
} from "@/components/map/nodeIndentShortcut";
import { insideOf } from "@/components/map/testing/treeEditShortcutTargets";
import {
  TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE,
  type TreeEditShortcutInput,
} from "@/components/map/treeEditShortcutGuard";

const baseInput: TreeEditShortcutInput = {
  key: "ArrowRight",
  altKey: true,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  isComposing: false,
  keyCode: 39,
  defaultPrevented: false,
  target: document.body,
  isEditing: false,
  selectedNodeId: 1,
  hasActiveGesture: false,
};

describe("resolveNodeIndentShortcut", () => {
  it("Alt+ArrowRight は indent", () => {
    expect(resolveNodeIndentShortcut(baseInput)).toBe("indent");
  });

  it("Alt+ArrowLeft は outdent", () => {
    expect(resolveNodeIndentShortcut({ ...baseInput, key: "ArrowLeft", keyCode: 37 })).toBe("outdent");
  });

  it.each([
    ["ArrowUp", 38],
    ["ArrowDown", 40],
    ["x", 88],
  ])("%s は null", (key, keyCode) => {
    expect(resolveNodeIndentShortcut({ ...baseInput, key, keyCode })).toBeNull();
  });

  it.each<[string, Partial<TreeEditShortcutInput>]>([
    ["altKey なし", { altKey: false }],
    ["shiftKey 併用", { shiftKey: true }],
    ["ctrlKey 併用", { ctrlKey: true }],
    ["metaKey 併用", { metaKey: true }],
    ["isComposing", { isComposing: true }],
    ["keyCode 229", { keyCode: 229 }],
    ["defaultPrevented", { defaultPrevented: true }],
    ["編集中", { isEditing: true }],
    ["選択なし", { selectedNodeId: null }],
    ["ジェスチャー中", { hasActiveGesture: true }],
    ["目印の無い button の内側", { target: insideOf("button") }],
  ])("%s は null", (_name, override) => {
    expect(resolveNodeIndentShortcut({ ...baseInput, ...override })).toBeNull();
  });

  it("目印付きの button では働く", () => {
    const target = insideOf("button", { [TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE]: "" });
    expect(resolveNodeIndentShortcut({ ...baseInput, target })).toBe("indent");
  });
});

describe("shouldSuppressAltArrowNavigation", () => {
  const navigationInput: AltArrowNavigationInput = {
    key: baseInput.key,
    altKey: baseInput.altKey,
    ctrlKey: baseInput.ctrlKey,
    metaKey: baseInput.metaKey,
    shiftKey: baseInput.shiftKey,
    isComposing: baseInput.isComposing,
    keyCode: baseInput.keyCode,
    defaultPrevented: baseInput.defaultPrevented,
    target: baseInput.target,
    isEditing: baseInput.isEditing,
  };

  it("Alt+ArrowRight / Alt+ArrowLeft は止める", () => {
    expect(shouldSuppressAltArrowNavigation(navigationInput)).toBe(true);
    expect(shouldSuppressAltArrowNavigation({ ...navigationInput, key: "ArrowLeft", keyCode: 37 })).toBe(true);
  });

  it("選択が無い場面でも止める（入力は選択を持たない）", () => {
    expect("selectedNodeId" in navigationInput).toBe(false);
    expect(shouldSuppressAltArrowNavigation(navigationInput)).toBe(true);
  });

  it.each<[string, () => EventTarget]>([
    ["目印の無い button", () => insideOf("button")],
    ["a[href]", () => insideOf("a", { href: "#" })],
  ])("%s の上でも止める", (_name, createTarget) => {
    expect(shouldSuppressAltArrowNavigation({ ...navigationInput, target: createTarget() })).toBe(true);
  });

  it.each<[string, () => EventTarget]>([
    ["input", () => insideOf("input")],
    ["textarea", () => insideOf("textarea")],
    ["select", () => insideOf("select")],
    ["contenteditable", () => insideOf("div", { contenteditable: "true" })],
  ])("%s の内側では止めない", (_name, createTarget) => {
    expect(shouldSuppressAltArrowNavigation({ ...navigationInput, target: createTarget() })).toBe(false);
  });

  it.each<[string, Partial<AltArrowNavigationInput>]>([
    ["編集中", { isEditing: true }],
    ["shiftKey 併用", { shiftKey: true }],
    ["ctrlKey 併用", { ctrlKey: true }],
    ["metaKey 併用", { metaKey: true }],
    ["altKey なし", { altKey: false }],
    ["isComposing", { isComposing: true }],
    ["keyCode 229", { keyCode: 229 }],
    ["defaultPrevented", { defaultPrevented: true }],
    ["ArrowUp", { key: "ArrowUp", keyCode: 38 }],
  ])("%s は止めない", (_name, override) => {
    expect(shouldSuppressAltArrowNavigation({ ...navigationInput, ...override })).toBe(false);
  });
});
