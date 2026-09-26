import { normalizeMapDocumentNodeImportance } from "@/domain/persistence/mapDocumentNodeImportance";

describe("normalizeMapDocumentNodeImportance", () => {
  it.each([undefined, "high", "urgent", null])(
    "V1ではimportance=%pを無視して既定重要度を返す",
    (importance) => {
      expect(normalizeMapDocumentNodeImportance(importance, 0, 1)).toEqual({
        ok: true,
        value: "medium",
      });
    },
  );

  it.each(["high", "medium", "low"] as const)(
    "V2では有効な重要度%sを返す",
    (importance) => {
      expect(normalizeMapDocumentNodeImportance(importance, 1, 2)).toEqual({
        ok: true,
        value: importance,
      });
    },
  );

  it.each([undefined, "urgent", 1])(
    "V2では不正なimportance=%pを拒否する",
    (importance) => {
      expect(normalizeMapDocumentNodeImportance(importance, 2, 2)).toEqual({
        ok: false,
        error: "node[2].importanceはhigh、medium、lowのいずれかである必要があります。",
      });
    },
  );
});
