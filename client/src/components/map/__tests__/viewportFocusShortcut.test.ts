import {
  isViewportFocusShortcut,
  resolveViewportFocusRequest,
} from "@/components/map/viewportFocusShortcut";
import type { Node } from "@/types/node";

const node: Node = {
  id: 1,
  parentId: null,
  x: 10,
  y: 20,
  width: 100,
  height: 60,
  label: "node",
};
const screen = { width: 800, height: 600 };

describe("isViewportFocusShortcut", () => {
  it.each(["f", "F"])("%sを修飾キーなしのfocus shortcutとして受け入れる", (key) => {
    expect(isViewportFocusShortcut({
      key,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })).toBe(true);
  });

  it.each([
    { key: "Enter", ctrlKey: false, metaKey: false, altKey: false },
    { key: "f", ctrlKey: true, metaKey: false, altKey: false },
    { key: "f", ctrlKey: false, metaKey: true, altKey: false },
    { key: "f", ctrlKey: false, metaKey: false, altKey: true },
  ])("対象外キーまたは修飾キー付きFを拒否する", (input) => {
    expect(isViewportFocusShortcut(input)).toBe(false);
  });
});

function resolve(overrides: Partial<Parameters<typeof resolveViewportFocusRequest>[0]> = {}) {
  return resolveViewportFocusRequest({
    key: "f",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: window,
    nodes: [node],
    selectedNodeId: 1,
    isEditing: false,
    hasActiveGesture: false,
    screen,
    ...overrides,
  });
}

describe("resolveViewportFocusRequest", () => {
  it("最新一覧の選択ノードと画面サイズを返す", () => {
    expect(resolve()).toEqual({ node, screen });
  });

  it.each([
    [{ key: "Enter" }],
    [{ ctrlKey: true }],
    [{ metaKey: true }],
    [{ altKey: true }],
    [{ isEditing: true }],
    [{ hasActiveGesture: true }],
    [{ screen: null }],
    [{ selectedNodeId: null }],
    [{ selectedNodeId: 99 }],
  ])("発動条件を満たさない入力を拒否する", (override) => {
    expect(resolve(override)).toBeNull();
  });

  it.each(["input", "textarea", "select"])("%sからの入力を拒否する", (tagName) => {
    expect(resolve({ target: document.createElement(tagName) })).toBeNull();
  });

  it("contenteditable配下からの入力を拒否する", () => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    const child = editor.appendChild(document.createElement("span"));

    expect(resolve({ target: child })).toBeNull();
  });

  it.each(["", "plaintext-only"])("contenteditable=%s配下からの入力を拒否する", (value) => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", value);
    const child = editor.appendChild(document.createElement("span"));

    expect(resolve({ target: child })).toBeNull();
  });

  it("contenteditable=true配下でもfalseで上書きされた領域では発動する", () => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    const disabledArea = editor.appendChild(document.createElement("div"));
    disabledArea.setAttribute("contenteditable", "false");
    const child = disabledArea.appendChild(document.createElement("span"));

    expect(resolve({ target: child })).toEqual({ node, screen });
  });
});
