import {
  AI_BRANCH_MAX_TOTAL_LENGTH,
  AI_IMPORTANCE_MAX_NODES,
  AI_SUMMARY_MAX_NODES,
  aiBranchInputFingerprint,
  buildAiBranchInput,
  excerptText,
  importanceTargetIds,
  validateAiBranchInput,
  type AiBranchInput,
} from "@/domain/aiAssist/aiBranchInput";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

const SUMMARY = { includeRootNote: false, maxNodes: AI_SUMMARY_MAX_NODES };
const IMPORTANCE = { includeRootNote: true, maxNodes: AI_IMPORTANCE_MAX_NODES };

// 根（id 1）の直下に count - 1 件の子を並べる。ラベルは全ノードで変える
function flatBranch(count: number, label: (id: number) => string = (id) => `項目${id}`): Node[] {
  return Array.from({ length: count }, (_, index) => createTestNode({
    id: index + 1,
    parentId: index === 0 ? null : 1,
    label: label(index + 1),
  }));
}

describe("excerptText", () => {
  it.each([30, 200, 500])("上限 %i: ちょうどはそのまま、1 超えは「…」付きで上限ちょうど", (max) => {
    const exact = "あ".repeat(max);
    expect(excerptText(exact, max)).toBe(exact);
    const over = "あ".repeat(max + 1);
    const cut = excerptText(over, max);
    expect(cut).toBe(`${"あ".repeat(max - 1)}…`);
    expect(cut.length).toBe(max);
  });

  it.each([30, 200, 500])("上限 %i: 切り口が対になっていない上位サロゲートなら 1 単位削る（L-636）", (max) => {
    const value = `${"a".repeat(max - 2)}😀b`;
    const cut = excerptText(value, max);
    expect(cut).toBe(`${"a".repeat(max - 2)}…`);
    expect(cut.length).toBeLessThanOrEqual(max);
  });
});

describe("buildAiBranchInput", () => {
  it("選んだノードを根に、先行順（兄弟は配列の順）で枝の全ノードを集める。枝の外は含めない", () => {
    const nodes = [
      createTestNode({ id: 9, parentId: null, label: "別の根" }),
      createTestNode({ id: 1, parentId: 9, label: "根" }),
      createTestNode({ id: 3, parentId: 1, label: "先の子" }),
      createTestNode({ id: 2, parentId: 1, label: "後の子" }),
      createTestNode({ id: 4, parentId: 3, label: "孫", importance: "low" }),
    ];

    const result = buildAiBranchInput(nodes, 1, IMPORTANCE);

    expect(result).toEqual({
      ok: true,
      truncatedCount: 0,
      totalLength: "根先の子孫後の子".length,
      input: {
        rootId: 1,
        nodes: [
          { id: 1, parentId: null, label: "根", importance: "medium" },
          { id: 3, parentId: 1, label: "先の子", importance: "medium" },
          { id: 4, parentId: 3, label: "孫", importance: "low" },
          { id: 2, parentId: 1, label: "後の子", importance: "medium" },
        ],
      },
    });
  });

  it("要約では根のメモを送らず、重要度では送る。空白だけのメモは持たない", () => {
    const nodes = [
      createTestNode({ id: 1, label: "根", note: "根のメモ" }),
      createTestNode({ id: 2, parentId: 1, label: "子", note: "子のメモ" }),
      createTestNode({ id: 3, parentId: 1, label: "空白", note: "   " }),
    ];

    const summary = buildAiBranchInput(nodes, 1, SUMMARY);
    const importance = buildAiBranchInput(nodes, 1, IMPORTANCE);

    expect(summary.ok && summary.input.nodes.map((node) => node.note)).toEqual([undefined, "子のメモ", undefined]);
    expect(summary.ok && "note" in summary.input.nodes[0]).toBe(false);
    expect(importance.ok && importance.input.nodes.map((node) => node.note)).toEqual(["根のメモ", "子のメモ", undefined]);
  });

  it("ラベルは 200、メモは 500 で抜粋し、切った値の数と抜粋後の合計を返す", () => {
    const nodes = [
      createTestNode({ id: 1, label: "根" }),
      createTestNode({ id: 2, parentId: 1, label: "あ".repeat(201), note: "い".repeat(501) }),
    ];

    const result = buildAiBranchInput(nodes, 1, SUMMARY);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.nodes[1].label).toBe(`${"あ".repeat(199)}…`);
    expect(result.input.nodes[1].note).toBe(`${"い".repeat(499)}…`);
    expect(result.truncatedCount).toBe(2);
    expect(result.totalLength).toBe(1 + 200 + 500);
  });

  it("ラベル 200 文字・メモ 500 文字ちょうどは切らずに送る", () => {
    const nodes = [
      createTestNode({ id: 1, label: "根" }),
      createTestNode({ id: 2, parentId: 1, label: "あ".repeat(200), note: "い".repeat(500) }),
    ];

    const result = buildAiBranchInput(nodes, 1, SUMMARY);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.nodes[1].label).toBe("あ".repeat(200));
    expect(result.input.nodes[1].note).toBe("い".repeat(500));
    expect(result.truncatedCount).toBe(0);
    expect(validateAiBranchInput(result.input, { maxNodes: AI_SUMMARY_MAX_NODES }).ok).toBe(true);
  });

  it("折りたたみ・深さ・解像度の状態に関係なく、枝の全ノード（深い孫まで）を集める", () => {
    // 表示状態はノード配列に無い（MapEditor の表示側の状態）。深さ 6 の鎖と低重要度の葉を含めて全件を返す
    const chain = Array.from({ length: 6 }, (_, index) => createTestNode({
      id: index + 1,
      parentId: index === 0 ? null : index,
      label: `深さ${index}`,
      importance: index === 5 ? "low" : "medium",
    }));

    const result = buildAiBranchInput(chain, 1, IMPORTANCE);

    expect(result.ok && result.input.nodes.map((node) => node.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it.each([
    ["要約", SUMMARY, AI_SUMMARY_MAX_NODES],
    ["重要度", IMPORTANCE, AI_IMPORTANCE_MAX_NODES],
  ])("%s: 上限ちょうどは送れ、1 件超えは too-many-nodes", (_name, options, max) => {
    expect(buildAiBranchInput(flatBranch(max), 1, options).ok).toBe(true);
    expect(buildAiBranchInput(flatBranch(max + 1), 1, options)).toEqual({ ok: false, reason: "too-many-nodes" });
  });

  it("合計 40,000 文字ちょうどは送れ、40,001 文字は too-large", () => {
    const exact = flatBranch(200, () => "あ".repeat(200));
    const exactResult = buildAiBranchInput(exact, 1, SUMMARY);
    expect(exactResult.ok && exactResult.totalLength).toBe(AI_BRANCH_MAX_TOTAL_LENGTH);

    const over = exact.map((node) => (node.id === 2 ? { ...node, note: "n" } : node));
    expect(buildAiBranchInput(over, 1, SUMMARY)).toEqual({ ok: false, reason: "too-large" });
  });

  it("根が無ければ node-missing", () => {
    expect(buildAiBranchInput(flatBranch(2), 99, SUMMARY)).toEqual({ ok: false, reason: "node-missing" });
  });
});

describe("aiBranchInputFingerprint", () => {
  it("同じ内容なら同じ、1 文字でも違えば違う", () => {
    const base = buildAiBranchInput(flatBranch(3), 1, SUMMARY);
    const same = buildAiBranchInput(flatBranch(3), 1, SUMMARY);
    const changed = buildAiBranchInput(flatBranch(3, (id) => (id === 3 ? "項目X" : `項目${id}`)), 1, SUMMARY);
    if (!base.ok || !same.ok || !changed.ok) throw new Error("前提");

    expect(aiBranchInputFingerprint(base.input)).toBe(aiBranchInputFingerprint(same.input));
    expect(aiBranchInputFingerprint(base.input)).not.toBe(aiBranchInputFingerprint(changed.input));
  });
});

describe("importanceTargetIds", () => {
  it("枝のうちロックされていないノードの ID を先行順で返す", () => {
    const nodes = [
      createTestNode({ id: 1, label: "根" }),
      createTestNode({ id: 2, parentId: 1, label: "ロック", locked: true }),
      createTestNode({ id: 3, parentId: 2, label: "孫" }),
    ];
    const result = buildAiBranchInput(nodes, 1, IMPORTANCE);
    if (!result.ok) throw new Error("前提");

    expect(importanceTargetIds(result.input, nodes)).toEqual([1, 3]);
    expect(result.input.nodes.map((n) => n.id)).toEqual([1, 2, 3]);
  });
});

describe("validateAiBranchInput", () => {
  const valid: AiBranchInput = {
    rootId: 1,
    nodes: [
      { id: 1, parentId: null, label: "根", importance: "high" },
      { id: 2, parentId: 1, label: "子", note: "メモ", importance: "low" },
    ],
  };

  it("正しい入力を、許可した項目だけの新しいオブジェクトとして返す", () => {
    expect(validateAiBranchInput(valid, { maxNodes: AI_SUMMARY_MAX_NODES })).toEqual({ ok: true, input: valid });
  });

  it.each<[string, unknown, number]>([
    ["配列", [], 200],
    ["余分な項目", { ...valid, extra: 1 }, 200],
    ["rootId が整数でない", { ...valid, rootId: 1.5 }, 200],
    ["ID の重複", { rootId: 1, nodes: [valid.nodes[0], { ...valid.nodes[1], id: 1 }] }, 200],
    ["根が 2 件", { rootId: 1, nodes: [valid.nodes[0], { ...valid.nodes[1], parentId: null }] }, 200],
    ["根の ID と rootId が違う", { ...valid, rootId: 2 }, 200],
    ["枝の外の親", { rootId: 1, nodes: [valid.nodes[0], { ...valid.nodes[1], parentId: 7 }] }, 200],
    ["循環", { rootId: 1, nodes: [valid.nodes[0], { id: 2, parentId: 3, label: "a", importance: "low" }, { id: 3, parentId: 2, label: "b", importance: "low" }] }, 200],
    ["ID が整数でない", { rootId: 1, nodes: [valid.nodes[0], { ...valid.nodes[1], id: 2.5 }] }, 200],
    ["ノードの余分な項目", { rootId: 1, nodes: [valid.nodes[0], { ...valid.nodes[1], x: 0 }] }, 200],
    ["ラベル 201 文字", { rootId: 1, nodes: [valid.nodes[0], { ...valid.nodes[1], label: "あ".repeat(201) }] }, 200],
    ["メモ 501 文字", { rootId: 1, nodes: [valid.nodes[0], { ...valid.nodes[1], note: "い".repeat(501) }] }, 200],
    ["空のメモ", { rootId: 1, nodes: [valid.nodes[0], { ...valid.nodes[1], note: "" }] }, 200],
    ["不正な重要度", { rootId: 1, nodes: [valid.nodes[0], { ...valid.nodes[1], importance: "urgent" }] }, 200],
    ["ノード数の上限超え", valid, 1],
    ["合計の上限超え", { rootId: 1, nodes: Array.from({ length: 201 }, (_, i) => ({ id: i + 1, parentId: i === 0 ? null : 1, label: "あ".repeat(200), importance: "medium" })) }, 1000],
  ])("%s は不正", (_name, value, maxNodes) => {
    expect(validateAiBranchInput(value, { maxNodes })).toEqual({ ok: false });
  });
});
