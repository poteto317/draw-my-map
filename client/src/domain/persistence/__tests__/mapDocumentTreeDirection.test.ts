import { normalizeMapDocumentTreeDirection, projectMapDocumentTreeDirection } from "@/domain/persistence/mapDocumentTreeDirection";

describe("normalizeMapDocumentTreeDirection", () => {
  it.each([1, 2, 3] as const)(
    "V%sで欠落はlrを返す",
    (version) => {
      expect(normalizeMapDocumentTreeDirection(undefined, version)).toEqual({ ok: true, value: "lr" });
    },
  );

  it.each(["lr", "tb"] as const)("V3で有効な%sを返す", (direction) => {
    expect(normalizeMapDocumentTreeDirection(direction, 3)).toEqual({ ok: true, value: direction });
  });

  it.each([1, 2] as const)("V%sではtbを無視してlrを返す", (version) => {
    expect(normalizeMapDocumentTreeDirection("tb", version)).toEqual({ ok: true, value: "lr" });
  });

  it.each(["grid", 1, null, false])("V3で不正な値%pを拒否する", (raw) => {
    expect(normalizeMapDocumentTreeDirection(raw, 3)).toEqual({
      ok: false,
      error: "treeDirectionはlrまたはtbである必要があります。",
    });
  });
});

describe("projectMapDocumentTreeDirection", () => {
  it("lrのときキーを省略する", () => {
    expect(projectMapDocumentTreeDirection("lr")).toEqual({});
    expect(projectMapDocumentTreeDirection(undefined)).toEqual({});
  });

  it("tbのときだけ書き出す", () => {
    expect(projectMapDocumentTreeDirection("tb")).toEqual({ treeDirection: "tb" });
  });
});