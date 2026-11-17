import { projectMapDocumentNode } from "@/domain/persistence/mapDocumentNodeProjection";

describe("projectMapDocumentNode", () => {
  it("永続化対象の8フィールドだけを新しいNodeへ投影する", () => {
    const source = {
      id: 10,
      parentId: null,
      x: 12,
      y: -5,
      width: 160,
      height: 64,
      label: "ルート",
      importance: "medium" as const,
      selected: true,
    };

    const result = projectMapDocumentNode(source);

    expect(result).toEqual({
      id: 10,
      parentId: null,
      x: 12,
      y: -5,
      width: 160,
      height: 64,
      label: "ルート",
      importance: "medium" as const,
    });
    expect(result).not.toBe(source);
  });

  it("note があるときだけ項目を出す", () => {
    const base = {
      id: 1, parentId: null, x: 0, y: 0, width: 100, height: 60, label: "a", importance: "medium" as const,
    };

    expect(projectMapDocumentNode({ ...base, note: "メモ" })).toEqual({ ...base, note: "メモ" });
    expect("note" in projectMapDocumentNode(base)).toBe(false);
    expect("note" in projectMapDocumentNode({ ...base, note: undefined })).toBe(false);
  });

  it("links があるときだけ項目を出す", () => {
    const base = {
      id: 1, parentId: null, x: 0, y: 0, width: 100, height: 60, label: "a", importance: "medium" as const,
    };

    expect(projectMapDocumentNode({ ...base, links: ["https://example.com/"] })).toEqual({ ...base, links: ["https://example.com/"] });
    expect("links" in projectMapDocumentNode(base)).toBe(false);
    expect("links" in projectMapDocumentNode({ ...base, links: undefined })).toBe(false);
  });

  it("tags があるときだけ項目を出す", () => {
    const base = {
      id: 1, parentId: null, x: 0, y: 0, width: 100, height: 60, label: "a", importance: "medium" as const,
    };

    expect(projectMapDocumentNode({ ...base, tags: ["重要"] })).toEqual({ ...base, tags: ["重要"] });
    expect("tags" in projectMapDocumentNode(base)).toBe(false);
    expect("tags" in projectMapDocumentNode({ ...base, tags: undefined })).toBe(false);
  });
});
