import { resolveNodeSearchKeyAction } from "@/components/layout/nodeSearchKeyAction";

const baseInput = {
  key: "x",
  isComposing: false,
  keyCode: 0,
  repeat: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  isOpen: false,
  hasQuery: false,
  hasResults: false,
};

describe("resolveNodeSearchKeyAction", () => {
  it.each([
    [{ key: "ArrowDown", isOpen: false, hasQuery: true }, "open"],
    [{ key: "ArrowDown", isOpen: true, hasResults: true }, "next"],
    [{ key: "ArrowUp", isOpen: true, hasResults: true }, "previous"],
    [{ key: "Enter", isOpen: true, hasResults: true }, "select"],
    [{ key: "Enter", isOpen: true, hasResults: false }, "prevent"],
    [{ key: "Enter", isOpen: false, hasResults: true }, "prevent"],
    [{ key: "Escape", isOpen: true }, "close"],
    [{ key: "Escape", isOpen: false, hasQuery: true }, "clear"],
    [{ key: "ArrowDown", isOpen: false, hasQuery: false }, null],
    [{ key: "ArrowDown", isOpen: true, hasResults: false }, null],
    [{ key: "ArrowUp", isOpen: false, hasResults: true }, null],
    [{ key: "Escape", isOpen: false, hasQuery: false }, null],
    [{ key: "x" }, null],
  ] as const)("%jなら%sを返す", (overrides, expected) => {
    expect(resolveNodeSearchKeyAction({ ...baseInput, ...overrides })).toBe(expected);
  });

  it.each(["Enter", "Escape", "ArrowDown", "ArrowUp"])(
    "IME変換中の%sを扱わない",
    (key) => {
      expect(resolveNodeSearchKeyAction({
        ...baseInput,
        key,
        isOpen: true,
        hasQuery: true,
        hasResults: true,
        isComposing: true,
      })).toBeNull();
      expect(resolveNodeSearchKeyAction({
        ...baseInput,
        key,
        isOpen: true,
        hasQuery: true,
        hasResults: true,
        keyCode: 229,
      })).toBeNull();
    },
  );

  it("リピートEnterと修飾キー付きEnterを扱わない", () => {
    expect(resolveNodeSearchKeyAction({ ...baseInput, key: "Enter", repeat: true })).toBeNull();
    expect(resolveNodeSearchKeyAction({ ...baseInput, key: "Enter", ctrlKey: true })).toBeNull();
    expect(resolveNodeSearchKeyAction({ ...baseInput, key: "Enter", metaKey: true })).toBeNull();
    expect(resolveNodeSearchKeyAction({ ...baseInput, key: "Enter", altKey: true })).toBeNull();
  });

  it.each(["ArrowUp", "ArrowDown", "Escape"])(
    "修飾キー付き%sを扱わない",
    (key) => {
      for (const modifier of ["ctrlKey", "metaKey", "altKey"] as const) {
        expect(resolveNodeSearchKeyAction({
          ...baseInput,
          key,
          isOpen: true,
          hasQuery: true,
          hasResults: true,
          [modifier]: true,
        })).toBeNull();
      }
    },
  );
});
