import {
  normalizeMapDocumentNodeLabelBold,
  normalizeMapDocumentNodeLabelFontSize,
  normalizeMapDocumentNodeLabelUnderline,
} from "@/domain/persistence/mapDocumentNodeLabelTextStyle";
import { projectLabelTextStyle } from "@/domain/nodes/labelTextStyle";
import { normalizeMapDocumentNode } from "@/domain/persistence/mapDocumentNode";
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

describe("normalizeMapDocumentNodeLabelFontSize", () => {
  it.each([1, 2] as const)("V%s では無視する", (version) => {
    expect(normalizeMapDocumentNodeLabelFontSize(18, 0, version)).toEqual({ ok: true, value: undefined });
  });

  it("V3 で欠落は undefined", () => {
    expect(normalizeMapDocumentNodeLabelFontSize(undefined, 0, 3)).toEqual({ ok: true, value: undefined });
  });

  it.each([12, 14, 18, 24] as const)("V3 で許可値 %s を保持する", (size) => {
    expect(normalizeMapDocumentNodeLabelFontSize(size, 0, 3)).toEqual({ ok: true, value: size });
  });

  it.each([13, 15, 0, -1, 14.5, NaN, Infinity, "14", null, true, {}, []])(
    "V3 で不正な labelFontSize=%p は項目を落とす（文書は ok）",
    (raw) => {
      expect(normalizeMapDocumentNodeLabelFontSize(raw, 2, 3)).toEqual({ ok: true, value: undefined });
    },
  );
});

describe("normalizeMapDocumentNodeLabelBold / Underline", () => {
  it.each([1, 2] as const)("V%s では無視する", (version) => {
    expect(normalizeMapDocumentNodeLabelBold(true, 0, version)).toEqual({ ok: true, value: undefined });
    expect(normalizeMapDocumentNodeLabelUnderline(true, 0, version)).toEqual({ ok: true, value: undefined });
  });

  it("V3 で true だけを保持し、それ以外は落とす", () => {
    expect(normalizeMapDocumentNodeLabelBold(true, 0, 3)).toEqual({ ok: true, value: true });
    expect(normalizeMapDocumentNodeLabelUnderline(true, 0, 3)).toEqual({ ok: true, value: true });
    for (const raw of [false, null, 1, "true", undefined]) {
      expect(normalizeMapDocumentNodeLabelBold(raw, 1, 3)).toEqual({ ok: true, value: undefined });
      expect(normalizeMapDocumentNodeLabelUnderline(raw, 1, 3)).toEqual({ ok: true, value: undefined });
    }
  });
});

describe("encode 往復（projectLabelTextStyle + normalize）", () => {
  it("14 はキー無しになり、12/18/24 と bold/underline true は残る", () => {
    const withDefaults: Node = { ...base, labelFontSize: 14, labelBold: true, labelUnderline: true };
    const projected = projectMapDocumentNode(withDefaults);
    expect("labelFontSize" in projected).toBe(false);
    expect(projected.labelBold).toBe(true);
    expect(projected.labelUnderline).toBe(true);

    const roundTrip = normalizeMapDocumentNode(projected, 0, 3);
    expect(roundTrip).toEqual({
      ok: true,
      value: { ...base, labelBold: true, labelUnderline: true },
    });

    for (const size of [12, 18, 24] as const) {
      const node: Node = { ...base, labelFontSize: size, labelBold: true, labelUnderline: true };
      expect(projectLabelTextStyle(node)).toEqual({
        labelFontSize: size,
        labelBold: true,
        labelUnderline: true,
      });
      expect(normalizeMapDocumentNode(projectMapDocumentNode(node), 0, 3)).toEqual({
        ok: true,
        value: node,
      });
    }
  });

  it("許可外サイズは decode でキー削除され文書は ok", () => {
    const result = normalizeMapDocumentNode({ ...base, labelFontSize: 99, labelBold: false }, 0, 3);
    expect(result).toEqual({ ok: true, value: base });
    expect(result.ok && "labelFontSize" in result.value).toBe(false);
    expect(result.ok && "labelBold" in result.value).toBe(false);
  });
});
