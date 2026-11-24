import {
  normalizeMapDocumentNodeLayoutPinned,
  projectMapDocumentNodeLayoutPinned,
} from "@/domain/persistence/mapDocumentNodeLayoutPinned";

describe("normalizeMapDocumentNodeLayoutPinned", () => {
  it.each([1, 2] as const)("V%sではlayoutPinnedを無視する", (version) => {
    expect(normalizeMapDocumentNodeLayoutPinned(true, 0, version)).toEqual({ ok: true, value: undefined });
  });

  it("V3で欠落はundefined、trueだけ保持、不正は落とす", () => {
    expect(normalizeMapDocumentNodeLayoutPinned(undefined, 0, 3)).toEqual({ ok: true, value: undefined });
    expect(normalizeMapDocumentNodeLayoutPinned(true, 0, 3)).toEqual({ ok: true, value: true });
    expect(normalizeMapDocumentNodeLayoutPinned(false, 0, 3)).toEqual({ ok: true, value: undefined });
  });
});

describe("projectMapDocumentNodeLayoutPinned", () => {
  it("trueのときだけ書き出す", () => {
    expect(projectMapDocumentNodeLayoutPinned(true)).toEqual({ layoutPinned: true });
    expect(projectMapDocumentNodeLayoutPinned(undefined)).toEqual({});
  });
});
