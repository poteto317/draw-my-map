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
});
