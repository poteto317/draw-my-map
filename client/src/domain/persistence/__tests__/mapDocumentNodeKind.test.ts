import { projectNodeKind } from "@/domain/nodes/nodeKindUpdate";
import { normalizeMapDocumentNode } from "@/domain/persistence/mapDocumentNode";
import { normalizeMapDocumentNodeKind } from "@/domain/persistence/mapDocumentNodeKind";
import { projectMapDocumentNode } from "@/domain/persistence/mapDocumentNodeProjection";
import type { Node } from "@/types/node";

const base = {
  id: 1,
  parentId: null,
  x: 0,
  y: 0,
  width: 100,
  height: 60,
  label: "a",
  importance: "medium" as const,
};

describe("normalizeMapDocumentNodeKind", () => {
  it.each([1, 2] as const)("V%s では無視する", (version) => {
    expect(normalizeMapDocumentNodeKind("question", 0, version)).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("V3 で欠落は undefined", () => {
    expect(normalizeMapDocumentNodeKind(undefined, 0, 3)).toEqual({ ok: true, value: undefined });
  });

  it.each(["question", "conclusion", "evidence", "idea"] as const)(
    "V3 で許可値 %s を保持する",
    (kind) => {
      expect(normalizeMapDocumentNodeKind(kind, 0, 3)).toEqual({ ok: true, value: kind });
    },
  );

  it.each(["other", "", 1, null, true, {}, "Question"])(
    "V3 で不正な kind=%p はキー削除（文書は ok）",
    (raw) => {
      expect(normalizeMapDocumentNodeKind(raw, 2, 3)).toEqual({ ok: true, value: undefined });
    },
  );
});

describe("encode 往復（projectNodeKind + normalize）", () => {
  it("許可 kind は残り、不正・欠落はキー省略", () => {
    const withKind: Node = { ...base, kind: "evidence" };
    expect(projectNodeKind(withKind)).toEqual({ kind: "evidence" });
    expect(normalizeMapDocumentNode(projectMapDocumentNode(withKind), 0, 3)).toEqual({
      ok: true,
      value: withKind,
    });

    const result = normalizeMapDocumentNode({ ...base, kind: "other" }, 0, 3);
    expect(result).toEqual({ ok: true, value: base });
    expect(result.ok && "kind" in result.value).toBe(false);

    const projected = projectMapDocumentNode(base);
    expect("kind" in projected).toBe(false);
  });
});
