import {
  resolveNodeParentInsertionShortcut,
  type NodeParentInsertionShortcutInput,
} from "@/components/map/nodeParentInsertionShortcut";
import { insideOf } from "@/components/map/testing/treeEditShortcutTargets";
import { TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE } from "@/components/map/treeEditShortcutGuard";

const baseInput: NodeParentInsertionShortcutInput = {
  key: "Enter",
  altKey: true,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  isComposing: false,
  keyCode: 13,
  defaultPrevented: false,
  target: document.body,
  isEditing: false,
  selectedNodeId: 1,
  hasActiveGesture: false,
  repeat: false,
};

describe("resolveNodeParentInsertionShortcut", () => {
  it("Alt+Enter は insert", () => {
    expect(resolveNodeParentInsertionShortcut(baseInput)).toBe("insert");
  });

  it("押し続け（repeat）は suppress", () => {
    expect(resolveNodeParentInsertionShortcut({ ...baseInput, repeat: true })).toBe("suppress");
  });

  it.each([
    ["ArrowRight", 39],
    ["ArrowUp", 38],
    ["Tab", 9],
  ])("%s は repeat でも null", (key, keyCode) => {
    expect(resolveNodeParentInsertionShortcut({ ...baseInput, key, keyCode })).toBeNull();
    expect(resolveNodeParentInsertionShortcut({ ...baseInput, key, keyCode, repeat: true })).toBeNull();
  });

  it.each<[string, Partial<NodeParentInsertionShortcutInput>]>([
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
    ["目印の無い button", { target: insideOf("button") }],
    ["input", { target: insideOf("input") }],
    ["textarea", { target: insideOf("textarea") }],
  ])("%s は null（repeat でも suppress にならない）", (_name, override) => {
    expect(resolveNodeParentInsertionShortcut({ ...baseInput, ...override })).toBeNull();
    expect(resolveNodeParentInsertionShortcut({ ...baseInput, ...override, repeat: true })).toBeNull();
  });

  it("目印付きの button とその内側の span では働く", () => {
    const button = document.createElement("button");
    button.setAttribute(TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE, "");
    expect(resolveNodeParentInsertionShortcut({ ...baseInput, target: button })).toBe("insert");
    const inner = insideOf("button", { [TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE]: "" });
    expect(resolveNodeParentInsertionShortcut({ ...baseInput, target: inner })).toBe("insert");
  });
});
