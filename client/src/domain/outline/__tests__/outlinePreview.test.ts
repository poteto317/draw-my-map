import type { OutlineItem, ParsedOutline } from "../outlineParser";
import {
  buildOutlinePreview,
  truncateOutlinePreviewLabel,
  type OutlinePreviewNode,
} from "../outlinePreview";

function makeOutline(items: OutlineItem[]): ParsedOutline {
  return {
    items,
    rootCount: items.filter((item) => item.depth === 0).length,
    maxDepth: items.reduce((max, item) => Math.max(max, item.depth), 0),
    warnings: [],
  };
}

function siblings(count: number): ParsedOutline {
  return makeOutline(
    Array.from({ length: count }, (_, index) => ({
      label: `項目${index}`,
      depth: 0,
      parentIndex: null,
      lineNumber: index + 1,
    })),
  );
}

function chain(count: number): ParsedOutline {
  return makeOutline(
    Array.from({ length: count }, (_, index) => ({
      label: `項目${index}`,
      depth: index,
      parentIndex: index === 0 ? null : index - 1,
      lineNumber: index + 1,
    })),
  );
}

describe("buildOutlinePreview の打ち切り", () => {
  it.each([
    [199, 199, false, 199],
    [200, 200, false, 200],
    [201, 200, true, 200],
  ])(
    "兄弟だけの%i件は shownCount %i、truncated %s、roots %i",
    (total, shown, truncated, rootLength) => {
      const preview = buildOutlinePreview(siblings(total));
      expect(preview.totalCount).toBe(total);
      expect(preview.shownCount).toBe(shown);
      expect(preview.truncated).toBe(truncated);
      expect(preview.roots).toHaveLength(rootLength);
    },
  );

  it("201件の鎖は深さ200の入れ子で、最も深い children は空", () => {
    const preview = buildOutlinePreview(chain(201));
    expect(preview.roots).toHaveLength(1);
    let depth = 1;
    let node: OutlinePreviewNode = preview.roots[0];
    while (node.children.length > 0) {
      expect(node.children).toHaveLength(1);
      node = node.children[0];
      depth += 1;
    }
    expect(depth).toBe(200);
    expect(node.key).toBe(199);
  });

  it("先頭の木の途中で切れる森では2本目の根が roots[1] にあり子は49件（根を含めて50件）", () => {
    const items: OutlineItem[] = [];
    // 1本目: 根 + 子149件 = 150件
    items.push({ label: "根1", depth: 0, parentIndex: null, lineNumber: 1 });
    for (let i = 0; i < 149; i += 1) {
      items.push({
        label: `a${i}`,
        depth: 1,
        parentIndex: 0,
        lineNumber: i + 2,
      });
    }
    // 2本目: 根 + 子99件 = 100件（先頭の50件だけ表示される）
    items.push({ label: "根2", depth: 0, parentIndex: null, lineNumber: 151 });
    for (let i = 0; i < 99; i += 1) {
      items.push({
        label: `b${i}`,
        depth: 1,
        parentIndex: 150,
        lineNumber: i + 152,
      });
    }
    const preview = buildOutlinePreview(makeOutline(items));
    expect(preview.truncated).toBe(true);
    expect(preview.roots).toHaveLength(2);
    expect(preview.roots[0].children).toHaveLength(149);
    expect(preview.roots[1].label).toBe("根2");
    expect(preview.roots[1].children).toHaveLength(49);
  });

  it("maxItems を渡すとその件数だけを木にする", () => {
    const preview = buildOutlinePreview(siblings(10), 3);
    expect(preview.shownCount).toBe(3);
    expect(preview.totalCount).toBe(10);
    expect(preview.truncated).toBe(true);
    expect(preview.roots.map((node) => node.label)).toEqual([
      "項目0",
      "項目1",
      "項目2",
    ]);
  });

  it("key は items の添字", () => {
    const outline = makeOutline([
      { label: "A", depth: 0, parentIndex: null, lineNumber: 1 },
      { label: "B", depth: 1, parentIndex: 0, lineNumber: 2 },
      { label: "C", depth: 0, parentIndex: null, lineNumber: 3 },
    ]);
    const preview = buildOutlinePreview(outline);
    expect(preview.roots.map((node) => node.key)).toEqual([0, 2]);
    expect(preview.roots[0].children.map((node) => node.key)).toEqual([1]);
  });
});

describe("プレビューのラベル", () => {
  it("80コードポイントはそのまま、81コードポイントは先頭80と省略記号", () => {
    expect(truncateOutlinePreviewLabel("😀".repeat(80))).toBe("😀".repeat(80));
    expect(truncateOutlinePreviewLabel("😀".repeat(81))).toBe(
      "😀".repeat(80) + "…",
    );
  });

  it("木のラベルは省略するが、outline の items は変えない", () => {
    const longLabel = "😀".repeat(81);
    const outline = makeOutline([
      { label: longLabel, depth: 0, parentIndex: null, lineNumber: 1 },
    ]);
    const preview = buildOutlinePreview(outline);
    expect(preview.roots[0].label).toBe("😀".repeat(80) + "…");
    expect(outline.items[0].label).toBe(longLabel);
  });
});
