import { resolveMapHistoryShortcut } from "@/components/map/mapHistoryShortcut";

type KeyInit = KeyboardEventInit & { target?: EventTarget; preventBefore?: boolean };

function keyEvent({ target = document.body, preventBefore = false, ...init }: KeyInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  if (preventBefore) event.preventDefault();
  target.dispatchEvent(event);
  return event;
}

function resolve(init: KeyInit) {
  return resolveMapHistoryShortcut(keyEvent(init));
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("resolveMapHistoryShortcut のキーの組み合わせ", () => {
  it.each([
    { key: "z", ctrlKey: true, expected: "undo" },
    { key: "z", metaKey: true, expected: "undo" },
    { key: "Z", ctrlKey: true, expected: "undo" },
    { key: "Z", metaKey: true, expected: "undo" },
    { key: "Z", ctrlKey: true, shiftKey: true, expected: "redo" },
    { key: "z", ctrlKey: true, shiftKey: true, expected: "redo" },
    { key: "Z", metaKey: true, shiftKey: true, expected: "redo" },
    { key: "z", metaKey: true, shiftKey: true, expected: "redo" },
    { key: "y", ctrlKey: true, expected: "redo" },
    { key: "Y", ctrlKey: true, expected: "redo" },
    { key: "y", ctrlKey: true, shiftKey: true, expected: null },
    { key: "y", metaKey: true, expected: null },
    { key: "y", metaKey: true, shiftKey: true, expected: null },
    { key: "z", expected: null },
    { key: "y", expected: null },
    { key: "z", shiftKey: true, expected: null },
    { key: "x", ctrlKey: true, expected: null },
    { key: "Enter", ctrlKey: true, expected: null },
    { key: "z", ctrlKey: true, altKey: true, expected: null },
    { key: "z", metaKey: true, altKey: true, expected: null },
    { key: "Z", ctrlKey: true, shiftKey: true, altKey: true, expected: null },
    { key: "y", ctrlKey: true, altKey: true, expected: null },
    { key: "z", ctrlKey: true, metaKey: true, expected: null },
    { key: "Z", ctrlKey: true, metaKey: true, shiftKey: true, expected: null },
    { key: "y", ctrlKey: true, metaKey: true, expected: null },
    { key: "z", ctrlKey: true, metaKey: true, altKey: true, expected: null },
    { key: "z", altKey: true, expected: null },
  ] as const)("$key ctrl=$ctrlKey meta=$metaKey shift=$shiftKey alt=$altKey → $expected", ({ expected, ...init }) => {
    expect(resolve(init)).toBe(expected);
  });

  it.each([
    { name: "IME変換中", init: { isComposing: true } },
    { name: "keyCode 229のIME処理", init: { keyCode: 229 } },
    { name: "キーリピート", init: { repeat: true } },
    { name: "defaultPrevented済み", init: { preventBefore: true } },
  ])("$nameは処理しない", ({ init }) => {
    expect(resolve({ key: "z", ctrlKey: true, ...init })).toBeNull();
    expect(resolve({ key: "Z", ctrlKey: true, shiftKey: true, ...init })).toBeNull();
    expect(resolve({ key: "y", ctrlKey: true, ...init })).toBeNull();
  });
});

// 編集先かどうかの詳細な判定（textarea・select・contenteditableの各値）は editableTarget.test.ts で検証する。
// ここでは、判定結果に応じてショートカットを無効にすることを代表例で確認する
describe("resolveMapHistoryShortcut の入力先ガード", () => {
  function mount(html: string, selector: string): HTMLElement {
    document.body.innerHTML = html;
    return document.querySelector<HTMLElement>(selector)!;
  }

  it.each([
    { name: "input", html: '<input id="t" />' },
    { name: "contenteditableの子要素", html: '<div contenteditable="true"><p><span id="t">x</span></p></div>' },
    { name: "ノード編集入力", html: '<input id="t" data-testid="node-label-input" type="text" />' },
  ])("$name内ではブラウザ側に任せる", ({ html }) => {
    const target = mount(html, "#t");

    expect(resolve({ key: "z", ctrlKey: true, target })).toBeNull();
    expect(resolve({ key: "z", metaKey: true, shiftKey: true, target })).toBeNull();
    expect(resolve({ key: "y", ctrlKey: true, target })).toBeNull();
  });

  it.each([
    { name: "ボタン", html: '<button id="t" type="button">元に戻す</button>' },
    { name: "通常のdiv", html: '<div id="t"></div>' },
  ])("$nameではマップの履歴操作として扱う", ({ html }) => {
    const target = mount(html, "#t");

    expect(resolve({ key: "z", ctrlKey: true, target })).toBe("undo");
    expect(resolve({ key: "y", ctrlKey: true, target })).toBe("redo");
  });

  it("windowを対象にしたキーも扱う", () => {
    expect(resolve({ key: "z", ctrlKey: true, target: window })).toBe("undo");
  });
});
