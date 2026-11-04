import { formatOutlineRows } from "@/domain/outline/outlineExport";
import { buildOutlineRows, type OutlineRows } from "@/domain/outline/outlineRows";
import { parseOutlineText } from "@/domain/outline/outlineParser";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

const node = (id: number, parentId: number | null, label: string, extra: Partial<Node> = {}) =>
  createTestNode({ id, parentId, label, ...extra });

describe("formatOutlineRows", () => {
  it("preservesCanonicalOrderAndAttributes", () => {
    const nodes = Object.freeze([
      Object.freeze(node(3, 1, "子B", { x: 42, y: -20, importance: "high", illustration: "data:image/png;base64,AA" })),
      Object.freeze(node(1, null, "根A", { importance: "low" })),
      Object.freeze(node(2, 1, "子A")),
      Object.freeze(node(4, null, "根B")),
    ]);
    const before = nodes.map((current) => ({ ...current }));
    const rows = buildOutlineRows(nodes);
    expect(formatOutlineRows(rows, "md")).toEqual({ ok: true, text: "- 根A\n  - 子B\n  - 子A\n- 根B\n" });
    expect(formatOutlineRows(rows, "txt")).toEqual({ ok: true, text: "・根A\n  ・子B\n  ・子A\n・根B\n" });
    expect(nodes).toEqual(before);
  });

  it.each(["md", "txt"] as const)("normalizesPhysicalLinesWithoutDroppingNodes: %s", (format) => {
    const labels = ["  CR\r\nLF\rX\nY  ", "\tA\u0000B\u007fC\t", "# * [ ]", " \t\r\n "];
    const nodes = Object.freeze(labels.map((label, index) => Object.freeze(node(index + 1, null, label))));
    const before = nodes.map((current) => ({ ...current }));
    const result = formatOutlineRows(buildOutlineRows(nodes), format);
    const prefix = format === "md" ? "- " : "・";
    expect(result).toEqual({ ok: true, text: `${prefix}CR  LF X Y\n${prefix}A B C\n${prefix}# * [ ]\n${prefix}（空のノード）\n` });
    if (result.ok) {
      expect(result.text.startsWith("\uFEFF")).toBe(false);
      expect(result.text.endsWith("\n\n")).toBe(false);
    }
    expect(nodes).toEqual(before);
  });

  it.each(["md", "txt"] as const)("roundTripsSupportedStructure: %s", (format) => {
    const nodes = [node(3, 1, "子"), node(1, null, "根"), node(2, 1, "- 追記"), node(4, null, "・別根")];
    const exported = formatOutlineRows(buildOutlineRows(nodes), format);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const parsed = parseOutlineText(exported.text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.outline.items.map(({ label, depth, parentIndex }) => ({ label, depth, parentIndex }))).toEqual([
      { label: "根", depth: 0, parentIndex: null },
      { label: "子", depth: 1, parentIndex: 0 },
      { label: "- 追記", depth: 1, parentIndex: 0 },
      { label: "・別根", depth: 0, parentIndex: null },
    ]);
  });

  it("rejectsEmptyAndInvalidStructure", () => {
    expect(formatOutlineRows(buildOutlineRows([]), "md")).toEqual({ ok: false, reason: "empty" });
    for (const nodes of [
      [node(1, null, "a"), node(1, null, "b")],
      [node(1, 9, "a")],
      [node(1, 1, "a")],
      [node(1, 2, "a"), node(2, 1, "b")],
    ]) expect(formatOutlineRows(buildOutlineRows(nodes), "md")).toEqual({ ok: false, reason: "invalid-structure" });
  });

  it.each([["md", 999_997], ["txt", 999_998]] as const)("enforcesExactLimitForBothFormats: %s", (format, length) => {
    const rows = buildOutlineRows([node(1, null, "a".repeat(length))]);
    const exact = formatOutlineRows(rows, format);
    expect(exact.ok).toBe(true);
    if (exact.ok) expect(exact.text.length).toBe(1_000_000);
    const join = jest.spyOn(Array.prototype, "join");
    try {
      expect(formatOutlineRows(buildOutlineRows([node(1, null, "a".repeat(length + 1))]), format))
        .toEqual({ ok: false, reason: "too-large" });
      expect(join).not.toHaveBeenCalled();
    } finally { join.mockRestore(); }
  });

  it("rejectsDeepChainBeforeMaterializing", () => {
    const nodes = Array.from({ length: 10_000 }, (_, index) => node(10_000 - index, index === 9_999 ? null : 9_999 - index, "x"));
    const repeat = jest.spyOn(String.prototype, "repeat");
    const join = jest.spyOn(Array.prototype, "join");
    try {
      expect(formatOutlineRows(buildOutlineRows(nodes), "md")).toEqual({ ok: false, reason: "too-large" });
      expect(repeat).not.toHaveBeenCalled();
      expect(join).not.toHaveBeenCalled();
    } finally { repeat.mockRestore(); join.mockRestore(); }
  });

  it.each([Number.MAX_SAFE_INTEGER + 1, 0])("rejectsUnsafeDepth: %s", (depth) => {
    const model: OutlineRows = { rows: [{ nodeId: 1, depth }], nodesById: new Map([[1, node(1, null, "x")]]), allNodeIds: new Set([1]), invalidStructure: false, duplicateIds: false };
    expect(formatOutlineRows(model, "md")).toEqual({ ok: false, reason: "too-large" });
  });

  it("handlesWideForest", () => {
    const count = 10_000;
    const result = formatOutlineRows(buildOutlineRows(Array.from({ length: count }, (_, index) => node(index + 1, null, "x"))), "txt");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text.length).toBe(count * 3);
      expect(result.text.startsWith("・x\n")).toBe(true);
      expect(result.text.endsWith("・x\n")).toBe(true);
      expect(result.text.match(/・x\n/g)).toHaveLength(count);
    }
  });
});
