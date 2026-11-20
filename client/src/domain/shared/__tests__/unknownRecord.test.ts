import {
  hasOnlyKeys,
  hasOwn,
  isPlainRecord,
  isRecord,
  readProperty,
} from "@/domain/shared/unknownRecord";

describe("isRecord", () => {
  it.each([
    ["空のオブジェクト", {}],
    ["プロパティを持つオブジェクト", { a: 1 }],
    ["プロトタイプの無いオブジェクト", Object.create(null)],
  ])("%sは true", (_name, value) => {
    expect(isRecord(value)).toBe(true);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["配列", []],
    ["文字列", "x"],
    ["数値", 1],
    ["真偽値", true],
    ["関数", () => undefined],
  ])("%sは false", (_name, value) => {
    expect(isRecord(value)).toBe(false);
  });
});

describe("readProperty", () => {
  it("オブジェクトのプロパティの値を返す", () => {
    expect(readProperty({ label: "目標" }, "label")).toBe("目標");
    expect(readProperty({ label: null }, "label")).toBeNull();
  });

  it("無いプロパティは undefined", () => {
    expect(readProperty({}, "label")).toBeUndefined();
  });

  it("配列は添字の文字列で要素を読める", () => {
    expect(readProperty(["first", "second"], "0")).toBe("first");
    expect(readProperty([], "0")).toBeUndefined();
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["文字列", "abc"],
    ["数値", 5],
    ["真偽値", false],
  ])("オブジェクトでない値（%s）は undefined", (_name, value) => {
    expect(readProperty(value, "0")).toBeUndefined();
    expect(readProperty(value, "length")).toBeUndefined();
  });
});

describe("isPlainRecord", () => {
  it("通常オブジェクトと null プロトタイプオブジェクトは true", () => {
    expect(isPlainRecord({})).toBe(true);
    expect(isPlainRecord({ a: 1 })).toBe(true);
    expect(isPlainRecord(Object.create(null))).toBe(true);
  });

  it("クラスインスタンスや組み込みオブジェクト・プリミティブ・配列は false", () => {
    expect(isPlainRecord(new Date())).toBe(false);
    expect(isPlainRecord(new Map())).toBe(false);
    expect(isPlainRecord([])).toBe(false);
    expect(isPlainRecord(null)).toBe(false);
    expect(isPlainRecord("text")).toBe(false);
  });
});

describe("hasOwn / hasOnlyKeys", () => {
  it("hasOwn は継承プロパティを除外し自身プロパティのみ true を返す", () => {
    const obj: Record<string, unknown> = { a: undefined };
    expect(hasOwn(obj, "a")).toBe(true);
    expect(hasOwn(obj, "toString")).toBe(false);
    expect(hasOwn(obj, "__proto__")).toBe(false);
  });

  it("hasOnlyKeys は許可集合に含まれるキーのみのとき true を返す", () => {
    const allowed = new Set(["a", "b"]);
    expect(hasOnlyKeys({}, allowed)).toBe(true);
    expect(hasOnlyKeys({ a: 1 }, allowed)).toBe(true);
    expect(hasOnlyKeys({ a: 1, b: 2 }, allowed)).toBe(true);
    expect(hasOnlyKeys({ a: 1, c: 3 }, allowed)).toBe(false);
  });
});
