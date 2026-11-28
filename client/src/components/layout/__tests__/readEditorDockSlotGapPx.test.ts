import {
  isDockOverflowAutoMeasureSupported,
  readEditorDockSlotGapPx,
} from "@/components/layout/readEditorDockSlotGapPx";

describe("readEditorDockSlotGapPx", () => {
  it("明示 slotGapPx を優先する", () => {
    const el = document.createElement("div");
    expect(readEditorDockSlotGapPx(el, 8)).toBe(8);
    expect(readEditorDockSlotGapPx(el, -3)).toBe(0);
  });

  it("px の computed gap を読む", () => {
    const el = document.createElement("div");
    const orig = window.getComputedStyle;
    jest.spyOn(window, "getComputedStyle").mockImplementation((target) => {
      const style = orig.call(window, target);
      return new Proxy(style, {
        get(obj, prop, receiver) {
          if (prop === "columnGap" || prop === "gap") return "8px";
          return Reflect.get(obj, prop, receiver);
        },
      }) as CSSStyleDeclaration;
    });
    expect(readEditorDockSlotGapPx(el)).toBe(8);
  });

  it("0.5rem を px と誤認しない（parseFloat の罠）", () => {
    const el = document.createElement("div");
    const orig = window.getComputedStyle;
    jest.spyOn(window, "getComputedStyle").mockImplementation((target) => {
      const style = orig.call(window, target);
      return new Proxy(style, {
        get(obj, prop, receiver) {
          if (prop === "columnGap" || prop === "gap") return "0.5rem";
          return Reflect.get(obj, prop, receiver);
        },
      }) as CSSStyleDeclaration;
    });
    expect(readEditorDockSlotGapPx(el)).toBe(0);
  });

  it("getComputedStyle 例外時は 0", () => {
    const el = document.createElement("div");
    jest.spyOn(window, "getComputedStyle").mockImplementation(() => {
      throw new Error("boom");
    });
    expect(readEditorDockSlotGapPx(el)).toBe(0);
  });
});

describe("isDockOverflowAutoMeasureSupported", () => {
  it("jsdom では false", () => {
    expect(navigator.userAgent).toMatch(/jsdom/i);
    expect(isDockOverflowAutoMeasureSupported()).toBe(false);
  });
});
