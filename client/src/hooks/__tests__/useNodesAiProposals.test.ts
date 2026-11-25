import { act, renderHook } from "@testing-library/react";
import {
  buildImportanceProposals,
  buildNoteProposal,
  summaryInputFingerprintOf,
  type AiProposalsApplyOutcome,
} from "@/domain/aiAssist/aiProposal";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";
import { NODE_NOTE_MAX_LENGTH } from "@/domain/nodes/nodeNote";
import type { NodeMapState } from "@/types/nodeMapState";

type Hook = ReturnType<typeof useNodes>;

// 1: 根（メモあり）、2: 子A（low）、3: 子B（medium）。2→3 の関連線 10。ラベルは全ノードで変える
function initialMap(): NodeMapState {
  return {
    layoutMode: "manual",
    nodes: [
      createTestNode({ id: 1, label: "根", note: "前のメモ", importance: "high" }),
      createTestNode({ id: 2, parentId: 1, label: "子A", x: 220, importance: "low" }),
      createTestNode({ id: 3, parentId: 1, label: "子B", x: 220, y: 100, importance: "medium" }),
    ],
    relations: [{ id: 10, fromId: 2, toId: 3, kind: "related", directed: false }],
  };
}

function renderNodes() {
  const view = renderHook(() => useNodes());
  act(() => view.result.current.replaceMap(initialMap()));
  return view;
}

function nodeOf(current: Hook, id: number): Node {
  return current.nodes.find((node) => node.id === id)!;
}

function proposals(nodes: readonly Node[]) {
  const note = buildNoteProposal(nodes, 1, summaryInputFingerprintOf(nodes, 1)!, "要約")!;
  const importance = buildImportanceProposals(nodes, [{ id: 2, importance: "high", reason: "" }], [2]).proposals[0]!;
  return { note, importance };
}

describe("useNodes の applyAiProposals", () => {
  it("要約と重要度を 1 回の履歴として確定し、1 回の Undo で両方が戻る。documentRevision は変えない", () => {
    const { result } = renderNodes();
    const revision = result.current.documentRevision;
    const { note, importance } = proposals(result.current.nodes);
    let outcome!: AiProposalsApplyOutcome;

    act(() => { outcome = result.current.applyAiProposals([{ proposal: note, mode: "append" }, { proposal: importance }]); });

    expect(outcome).toEqual({ ok: true, appliedCount: 2 });
    expect(nodeOf(result.current, 1).note).toBe("前のメモ\n\n要約");
    expect(nodeOf(result.current, 2).importance).toBe("high");
    expect(result.current.documentRevision).toBe(revision);

    act(() => { result.current.undo(); });
    expect(nodeOf(result.current, 1).note).toBe("前のメモ");
    expect(nodeOf(result.current, 2).importance).toBe("low");
    expect(result.current.canUndo).toBe(false);
  });

  it("同じイベントの中の直前の変更を反映した最新の状態で照合し、古ければ何も変えない（L-453）", () => {
    const { result } = renderNodes();
    const { importance } = proposals(result.current.nodes);
    let outcome!: AiProposalsApplyOutcome;

    act(() => {
      result.current.updateNodeImportance(2, "medium");
      outcome = result.current.applyAiProposals([{ proposal: importance }]);
    });

    expect(outcome).toEqual({ ok: false, reason: "stale", staleKeys: [importance.key] });
    expect(nodeOf(result.current, 2).importance).toBe("medium");
    act(() => { result.current.undo(); });
    expect(result.current.canUndo).toBe(false);
  });

  it("関連線の選択中は applyNonStructuralChange が拒否し、rejected を返して履歴を増やさない", () => {
    const { result } = renderNodes();
    const { importance } = proposals(result.current.nodes);
    let outcome!: AiProposalsApplyOutcome;

    act(() => { result.current.selectRelation(10); });
    act(() => { outcome = result.current.applyAiProposals([{ proposal: importance }]); });

    expect(outcome).toEqual({ ok: false, reason: "rejected" });
    expect(nodeOf(result.current, 2).importance).toBe("low");
    expect(result.current.canUndo).toBe(false);
  });

  it("上限に近いメモへの追記は note-too-long で、何も変えず履歴を増やさない", () => {
    const { result } = renderNodes();
    const longNote = "あ".repeat(NODE_NOTE_MAX_LENGTH - 2);
    act(() => result.current.replaceMap({
      ...initialMap(),
      nodes: initialMap().nodes.map((node) => (node.id === 1 ? { ...node, note: longNote } : node)),
    }));
    const { note } = proposals(result.current.nodes);
    let outcome!: AiProposalsApplyOutcome;

    act(() => { outcome = result.current.applyAiProposals([{ proposal: note, mode: "append" }]); });

    expect(outcome).toEqual({ ok: false, reason: "note-too-long" });
    expect(nodeOf(result.current, 1).note).toBe(longNote);
    expect(result.current.canUndo).toBe(false);
  });

  it("採用が無ければ nothing-to-apply で履歴を増やさない（L-1072）", () => {
    const { result } = renderNodes();
    let outcome!: AiProposalsApplyOutcome;

    act(() => { outcome = result.current.applyAiProposals([]); });

    expect(outcome).toEqual({ ok: false, reason: "nothing-to-apply" });
    expect(result.current.canUndo).toBe(false);
  });
});
