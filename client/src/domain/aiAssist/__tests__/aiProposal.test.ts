import {
  applyAiProposals,
  buildImportanceProposals,
  buildNoteProposal,
  defaultNoteApplyMode,
  findStaleAiProposals,
  importanceProposalKey,
  noteProposalKey,
  planNoteFromSummary,
  summaryInputFingerprintOf,
  type AcceptedAiProposal,
  type AiProposal,
} from "@/domain/aiAssist/aiProposal";
import { NODE_NOTE_MAX_LENGTH } from "@/domain/nodes/nodeNote";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

// 1: 根（メモあり）、2: 子（重要度 low）、3: 子（重要度 medium）。ラベルは全ノードで変える
function baseNodes(): Node[] {
  return [
    createTestNode({ id: 1, label: "根", note: "既存のメモ", importance: "high" }),
    createTestNode({ id: 2, parentId: 1, label: "子A", importance: "low" }),
    createTestNode({ id: 3, parentId: 1, label: "子B", importance: "medium" }),
  ];
}

function rebuildFrom(nodes: readonly Node[]) {
  return (rootId: number) => summaryInputFingerprintOf(nodes, rootId);
}

function noteProposal(nodes: readonly Node[], summary = "要約"): Extract<AiProposal, { kind: "note" }> {
  const proposal = buildNoteProposal(nodes, 1, summaryInputFingerprintOf(nodes, 1)!, summary);
  if (proposal === null) throw new Error("前提");
  return proposal;
}

function importanceProposal(nodes: readonly Node[], id: number, proposed: "high" | "medium" | "low") {
  const { proposals } = buildImportanceProposals(nodes, [{ id, importance: proposed, reason: "理由" }], [id]);
  return proposals[0]!;
}

describe("planNoteFromSummary", () => {
  it("置き換えは要約そのもの、追記は空行で区切って末尾に足す", () => {
    expect(planNoteFromSummary("前", "要約", "replace")).toEqual({ ok: true, note: "要約" });
    expect(planNoteFromSummary("前", "要約", "append")).toEqual({ ok: true, note: "前\n\n要約" });
  });

  it("上限を超えるなら note-too-long（切り詰めない）", () => {
    const current = "あ".repeat(NODE_NOTE_MAX_LENGTH - 3);
    expect(planNoteFromSummary(current, "要約", "append")).toEqual({ ok: false, reason: "note-too-long" });
  });

  it("追記の結果がちょうど上限なら通り、1 文字超えると note-too-long（境界）", () => {
    // 結合は「現在 + 空行(2) + 要約(2)」
    const exact = "あ".repeat(NODE_NOTE_MAX_LENGTH - 4);
    const result = planNoteFromSummary(exact, "要約", "append");
    expect(result.ok && result.note.length).toBe(NODE_NOTE_MAX_LENGTH);
    expect(planNoteFromSummary(`${exact}あ`, "要約", "append")).toEqual({ ok: false, reason: "note-too-long" });
  });
});

describe("defaultNoteApplyMode", () => {
  it("メモが無ければ置き換え、あれば追記、追記で上限を超えるなら未選択", () => {
    expect(defaultNoteApplyMode(undefined, "要約")).toBe("replace");
    expect(defaultNoteApplyMode("前", "要約")).toBe("append");
    expect(defaultNoteApplyMode("あ".repeat(NODE_NOTE_MAX_LENGTH), "要約")).toBeNull();
  });
});

describe("提案の作り方", () => {
  it("要約は 1 件の note 提案で、作った時点のメモと入力の指紋を baseline に持つ", () => {
    const nodes = baseNodes();
    expect(noteProposal(nodes)).toEqual({
      key: noteProposalKey(1),
      kind: "note",
      nodeId: 1,
      baseline: { note: "既存のメモ", inputFingerprint: summaryInputFingerprintOf(nodes, 1) },
      summary: "要約",
    });
  });

  it("重要度は現在と違うものだけを提案にし、同じものと提案の無いものを数える（対象の順に並べる）", () => {
    const nodes = baseNodes();
    const result = buildImportanceProposals(nodes, [
      { id: 3, importance: "medium", reason: "同じ" },
      { id: 2, importance: "high", reason: "主要" },
    ], [1, 2, 3]);

    expect(result).toEqual({
      proposals: [{
        key: importanceProposalKey(2),
        kind: "importance",
        nodeId: 2,
        baseline: { importance: "low", label: "子A" },
        proposed: "high",
        reason: "主要",
      }],
      unchangedCount: 1,
      missingCount: 1,
    });
  });
});

describe("findStaleAiProposals", () => {
  it("変わっていなければ空", () => {
    const nodes = baseNodes();
    expect(findStaleAiProposals(nodes, [noteProposal(nodes), importanceProposal(nodes, 2, "high")], rebuildFrom(nodes))).toEqual([]);
  });

  it.each<[string, (nodes: Node[]) => Node[], "note" | "importance"]>([
    ["対象の削除（要約）", (nodes) => nodes.filter((node) => node.id !== 1).map((node) => ({ ...node, parentId: null })), "note"],
    ["対象のロック（要約）", (nodes) => nodes.map((node) => (node.id === 1 ? { ...node, locked: true as const } : node)), "note"],
    ["メモの変更", (nodes) => nodes.map((node) => (node.id === 1 ? { ...node, note: "別のメモ" } : node)), "note"],
    ["子孫のラベルの変更", (nodes) => nodes.map((node) => (node.id === 3 ? { ...node, label: "子B改" } : node)), "note"],
    ["子孫の追加", (nodes) => [...nodes, createTestNode({ id: 4, parentId: 2, label: "孫" })], "note"],
    ["子孫のメモの変更", (nodes) => nodes.map((node) => (node.id === 3 ? { ...node, note: "子のメモ" } : node)), "note"],
    ["子孫の重要度の変更", (nodes) => nodes.map((node) => (node.id === 3 ? { ...node, importance: "high" as const } : node)), "note"],
    // 先行順（1, 2, 3）は変わらず、親だけが変わる付け替え
    ["子孫の付け替え", (nodes) => nodes.map((node) => (node.id === 3 ? { ...node, parentId: 2 } : node)), "note"],
    ["対象の削除（重要度）", (nodes) => nodes.filter((node) => node.id !== 2), "importance"],
    ["対象のロック（重要度）", (nodes) => nodes.map((node) => (node.id === 2 ? { ...node, locked: true as const } : node)), "importance"],
    ["重要度の変更", (nodes) => nodes.map((node) => (node.id === 2 ? { ...node, importance: "medium" as const } : node)), "importance"],
    ["ラベルの変更", (nodes) => nodes.map((node) => (node.id === 2 ? { ...node, label: "子A改" } : node)), "importance"],
  ])("%s で古いと判定する", (_name, change, kind) => {
    const nodes = baseNodes();
    const proposal = kind === "note" ? noteProposal(nodes) : importanceProposal(nodes, 2, "high");
    const changed = change(nodes);

    expect(findStaleAiProposals(changed, [proposal], rebuildFrom(changed))).toEqual([proposal.key]);
  });
});

describe("applyAiProposals", () => {
  it("要約（置き換え）と複数ノードの重要度を 1 回で作り、適用した件数を返す", () => {
    const nodes = [...baseNodes(), createTestNode({ id: 4, parentId: 1, label: "子C", importance: "low" })];
    const accepted: AcceptedAiProposal[] = [
      { proposal: noteProposal(nodes, "新しい要約"), mode: "replace" },
      { proposal: importanceProposal(nodes, 2, "high") },
      { proposal: importanceProposal(nodes, 4, "medium") },
    ];

    const result = applyAiProposals(nodes, accepted, rebuildFrom(nodes));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.appliedCount).toBe(3);
    expect(result.nodes.find((node) => node.id === 1)?.note).toBe("新しい要約");
    expect(result.nodes.find((node) => node.id === 2)?.importance).toBe("high");
    expect(result.nodes.find((node) => node.id === 4)?.importance).toBe("medium");
    expect(result.nodes.find((node) => node.id === 3)).toBe(nodes[2]);
  });

  it("freeze した nodes を渡しても例外にならず、入力を変えない", () => {
    const nodes = baseNodes().map((node) => Object.freeze({ ...node }));
    Object.freeze(nodes);
    const snapshot = JSON.stringify(nodes);
    const result = applyAiProposals(nodes, [{ proposal: importanceProposal(nodes, 2, "high") }], rebuildFrom(nodes));
    expect(result.ok).toBe(true);
    expect(JSON.stringify(nodes)).toBe(snapshot);
  });

  it("追記は既存のメモの末尾に足す", () => {
    const nodes = baseNodes();
    const result = applyAiProposals(nodes, [{ proposal: noteProposal(nodes), mode: "append" }], rebuildFrom(nodes));
    expect(result.ok && result.nodes[0].note).toBe("既存のメモ\n\n要約");
  });

  it("1 件でも古ければ何も返さず、古い提案のキーを返す（L-063）", () => {
    const nodes = baseNodes();
    const stale = importanceProposal(nodes, 2, "high");
    const fresh = importanceProposal(nodes, 3, "low");
    const changed = nodes.map((node) => (node.id === 2 ? { ...node, importance: "medium" as const } : node));

    expect(applyAiProposals(changed, [{ proposal: stale }, { proposal: fresh }], rebuildFrom(changed)))
      .toEqual({ ok: false, reason: "stale", staleKeys: [stale.key] });
  });

  it("追記で上限を超えるなら note-too-long", () => {
    const nodes = baseNodes().map((node) => (node.id === 1 ? { ...node, note: "あ".repeat(NODE_NOTE_MAX_LENGTH - 3) } : node));
    expect(applyAiProposals(nodes, [{ proposal: noteProposal(nodes), mode: "append" }], rebuildFrom(nodes)))
      .toEqual({ ok: false, reason: "note-too-long" });
  });

  it("採用が無い、または変わる値が無いなら nothing-to-apply（空の Undo を積まない。L-1072）", () => {
    const nodes = baseNodes();
    expect(applyAiProposals(nodes, [], rebuildFrom(nodes))).toEqual({ ok: false, reason: "nothing-to-apply" });
    expect(applyAiProposals(nodes, [{ proposal: noteProposal(nodes, "既存のメモ"), mode: "replace" }], rebuildFrom(nodes)))
      .toEqual({ ok: false, reason: "nothing-to-apply" });
  });
});
