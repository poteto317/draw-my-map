import { normalizeMapDocumentNodeLocked, projectMapDocumentNodeLocked } from "@/domain/persistence/mapDocumentNodeLocked";

describe("normalizeMapDocumentNodeLocked", () => {
  it.each([1, 2] as const)("V%sではlockedを無視する", (version) => {
    expect(normalizeMapDocumentNodeLocked(true, 0, version)).toEqual({ ok: true, value: undefined });
    expect(normalizeMapDocumentNodeLocked(false, 0, version)).toEqual({ ok: true, value: undefined });
  });

  it("V3で欠落はundefinedを返す", () => {
    expect(normalizeMapDocumentNodeLocked(undefined, 0, 3)).toEqual({ ok: true, value: undefined });
  });

  it("V3でtrueだけを保持する", () => {
    expect(normalizeMapDocumentNodeLocked(true, 0, 3)).toEqual({ ok: true, value: true });
  });

  it.each([false, null, 1, "true"])("V3で不正なlocked=%pは項目を落とす", (raw) => {
    expect(normalizeMapDocumentNodeLocked(raw, 2, 3)).toEqual({ ok: true, value: undefined });
  });
});

describe("projectMapDocumentNodeLocked", () => {
  it("trueのときだけ書き出す", () => {
    expect(projectMapDocumentNodeLocked(true)).toEqual({ locked: true });
    expect(projectMapDocumentNodeLocked(undefined)).toEqual({});
  });
});