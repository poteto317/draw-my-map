import { isCommandPaletteShortcut } from "@/components/map/commandPaletteShortcut";

type KeyInit = KeyboardEventInit & { target?: EventTarget; preventBefore?: boolean };

function keyEvent({ target = document.body, preventBefore = false, ...init }: KeyInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  if (preventBefore) event.preventDefault();
  target.dispatchEvent(event);
  return event;
}

function isShortcut(init: KeyInit) {
  return isCommandPaletteShortcut(keyEvent(init));
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isCommandPaletteShortcut", () => {
  it.each([
    { key: "k", ctrlKey: true, expected: true },
    { key: "k", metaKey: true, expected: true },
    { key: "K", ctrlKey: true, expected: true },
    { key: "K", metaKey: true, expected: true },
    { key: "k", ctrlKey: true, shiftKey: true, expected: false },
    { key: "k", metaKey: true, shiftKey: true, expected: false },
    { key: "k", expected: false },
    { key: "k", altKey: true, expected: false },
    { key: "k", ctrlKey: true, altKey: true, expected: false },
    { key: "k", ctrlKey: true, metaKey: true, expected: false },
    { key: "z", ctrlKey: true, expected: false },
  ] as const)("$key ctrl=$ctrlKey meta=$metaKey shift=$shiftKey → $expected", ({ expected, ...init }) => {
    expect(isShortcut(init)).toBe(expected);
  });

  it.each([
    { name: "IME変換中", init: { isComposing: true } },
    { name: "keyCode 229のIME処理", init: { keyCode: 229 } },
    { name: "キーリピート", init: { repeat: true } },
    { name: "defaultPrevented済み", init: { preventBefore: true } },
  ])("$nameは偽", ({ init }) => {
    expect(isShortcut({ key: "k", ctrlKey: true, ...init })).toBe(false);
  });

  it("editable な入力先では偽", () => {
    document.body.innerHTML = '<input id="t" />';
    const target = document.querySelector("#t")!;
    expect(isShortcut({ key: "k", ctrlKey: true, target })).toBe(false);
  });

  it("通常のボタンでは真", () => {
    document.body.innerHTML = '<button id="t" type="button">コマンド</button>';
    const target = document.querySelector("#t")!;
    expect(isShortcut({ key: "k", metaKey: true, target })).toBe(true);
  });
});
