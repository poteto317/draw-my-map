import {
  areLayoutSpacingEqual,
  DEFAULT_LAYOUT_SPACING,
  normalizeMapDocumentLayoutSpacing,
  projectMapDocumentLayoutSpacing,
} from "@/domain/persistence/mapDocumentLayoutSpacing";

describe("normalizeMapDocumentLayoutSpacing", () => {
  it.each([1, 2, 3] as const)("V%sで欠落はundefinedを返す", (version) => {
    expect(normalizeMapDocumentLayoutSpacing(undefined, version)).toEqual({ ok: true, value: undefined });
  });

  it("V3で有効な間隔を返す", () => {
    expect(normalizeMapDocumentLayoutSpacing({ childGap: 100, siblingGap: 24 }, 3)).toEqual({
      ok: true,
      value: { childGap: 100, siblingGap: 24 },
    });
  });

  it.each([1, 2] as const)("V%sではオブジェクトを無視してundefinedを返す", (version) => {
    expect(normalizeMapDocumentLayoutSpacing({ childGap: 100, siblingGap: 24 }, version)).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it.each([
    [{ childGap: 100 }, "両方を持つ必要"],
    [{ siblingGap: 40 }, "両方を持つ必要"],
    [{ childGap: 7, siblingGap: 40 }, "8以上400以下の正の整数"],
    [{ childGap: 401, siblingGap: 40 }, "8以上400以下の正の整数"],
    [{ childGap: 120.5, siblingGap: 40 }, "8以上400以下の正の整数"],
    [null, "オブジェクト"],
    ["gap", "オブジェクト"],
  ] as const)("V3で不正なlayoutSpacing%pを拒否する", (raw, fragment) => {
    const result = normalizeMapDocumentLayoutSpacing(raw, 3);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(fragment);
  });
});

describe("projectMapDocumentLayoutSpacing", () => {
  it("既定値と一致するときキーを省略する", () => {
    expect(projectMapDocumentLayoutSpacing(undefined)).toEqual({});
    expect(projectMapDocumentLayoutSpacing(DEFAULT_LAYOUT_SPACING)).toEqual({});
  });

  it("非既定のときだけ書き出す", () => {
    expect(projectMapDocumentLayoutSpacing({ childGap: 100, siblingGap: 24 })).toEqual({
      layoutSpacing: { childGap: 100, siblingGap: 24 },
    });
  });
});

describe("areLayoutSpacingEqual", () => {
  it("欠落と既定値を同じとみなす", () => {
    expect(areLayoutSpacingEqual(undefined, DEFAULT_LAYOUT_SPACING)).toBe(true);
    expect(areLayoutSpacingEqual(undefined, undefined)).toBe(true);
  });

  it("値が違えばfalse", () => {
    expect(areLayoutSpacingEqual(undefined, { childGap: 100, siblingGap: 40 })).toBe(false);
  });
});