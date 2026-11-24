import {
  areLayoutStylesEqual,
  normalizeLayoutStyle,
  projectLayoutStyle,
} from "@/types/layoutStyle";

describe("normalizeLayoutStyle", () => {
  it.each(["orthogonal", "radial"] as const)("有効な %s を返す", (style) => {
    expect(normalizeLayoutStyle(style)).toBe(style);
  });

  it.each([undefined, "grid", 1, null, false, {}])("未知・欠落 %p は undefined", (raw) => {
    expect(normalizeLayoutStyle(raw)).toBeUndefined();
  });
});

describe("projectLayoutStyle / areLayoutStylesEqual", () => {
  it("orthogonal と欠落はキー省略・等価", () => {
    expect(projectLayoutStyle("orthogonal")).toEqual({});
    expect(projectLayoutStyle(undefined)).toEqual({});
    expect(projectLayoutStyle("radial")).toEqual({ layoutStyle: "radial" });
    expect(areLayoutStylesEqual(undefined, "orthogonal")).toBe(true);
    expect(areLayoutStylesEqual("radial", "orthogonal")).toBe(false);
  });
});
