import { projectNodeIcon } from "@/domain/nodes/nodeIcon";
import { normalizeMapDocumentNode } from "@/domain/persistence/mapDocumentNode";
import { normalizeMapDocumentNodeIcon } from "@/domain/persistence/mapDocumentNodeIcon";
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

describe("normalizeMapDocumentNodeIcon", () => {
  it.each([1, 2] as const)("V%s では無視する", (version) => {
    expect(normalizeMapDocumentNodeIcon("😀", 0, version)).toEqual({ ok: true, value: undefined });
  });

  it("V3 で欠落は undefined", () => {
    expect(normalizeMapDocumentNodeIcon(undefined, 0, 3)).toEqual({ ok: true, value: undefined });
  });

  it("V3 で Extended_Pictographic 1 書記素を保持する", () => {
    expect(normalizeMapDocumentNodeIcon("😀", 0, 3)).toEqual({ ok: true, value: "😀" });
  });

  it.each(["A", "😀😀", "", 1, null, true, {}])(
    "V3 で不正な icon=%p はキー削除（文書は ok）",
    (raw) => {
      expect(normalizeMapDocumentNodeIcon(raw, 2, 3)).toEqual({ ok: true, value: undefined });
    },
  );
});

describe("encode 往復（projectNodeIcon + normalize）", () => {
  it("受理 icon は残り、不正・欠落はキー省略", () => {
    const withIcon: Node = { ...base, icon: "🎯" };
    expect(projectNodeIcon(withIcon)).toEqual({ icon: "🎯" });
    expect(normalizeMapDocumentNode(projectMapDocumentNode(withIcon), 0, 3)).toEqual({
      ok: true,
      value: withIcon,
    });

    const result = normalizeMapDocumentNode({ ...base, icon: "A" }, 0, 3);
    expect(result).toEqual({ ok: true, value: base });
    expect(result.ok && "icon" in result.value).toBe(false);

    const projected = projectMapDocumentNode(base);
    expect("icon" in projected).toBe(false);
  });
});
