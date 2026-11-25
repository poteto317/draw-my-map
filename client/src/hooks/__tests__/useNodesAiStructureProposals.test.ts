import { act, renderHook } from "@testing-library/react";
import {
  addChildProposalKey,
  buildDuplicatePairProposals,
  structureInputFingerprintOf,
  type AiStructureApplyOutcome,
} from "@/domain/aiAssist/aiStructureProposal";
import type { AiProposal } from "@/domain/aiAssist/aiProposal";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";
import type { NodeMapState } from "@/types/nodeMapState";

const MAP_ID = "map-test";

function initialMap(): NodeMapState {
  return {
    layoutMode: "manual",
    nodes: [
      createTestNode({ id: 1, label: "根" }),
      createTestNode({ id: 2, parentId: 1, label: "子", x: 100, y: 80 }),
    ],
    relations: [{ id: 10, fromId: 1, toId: 2, kind: "related", directed: false }],
  };
}

function renderNodes() {
  const view = renderHook(() => useNodes());
  act(() => view.result.current.replaceMap(initialMap()));
  return view;
}

describe("useNodes の applyAiStructureProposals", () => {
  it("採用分を 1 回の履歴として確定し、1 回の Undo で戻る", () => {
    const { result } = renderNodes();
    const visible = new Set(result.current.nodes.map((node) => node.id));
    const proposal: Extract<AiProposal, { kind: "add-child" }> = {
      key: addChildProposalKey(1, "新", 0),
      kind: "add-child",
      parentId: 1,
      label: "新",
      baseline: {
        parentId: 1,
        inputFingerprint: structureInputFingerprintOf(result.current.nodes, 1, "child-candidates")!,
        assistKind: "child-candidates",
      },
    };
    let outcome!: AiStructureApplyOutcome;
    act(() => {
      outcome = result.current.applyAiStructureProposals([{ proposal }], visible, MAP_ID);
    });
    expect(outcome).toEqual({ ok: true, appliedCount: 1 });
    expect(result.current.nodes.some((node) => node.label === "新")).toBe(true);
    act(() => { result.current.undo(); });
    expect(result.current.nodes.some((node) => node.label === "新")).toBe(false);
    expect(result.current.canUndo).toBe(false);
  });

  it("関連線の選択中は rejected を返して履歴を増やさない", () => {
    const { result } = renderNodes();
    const visible = new Set(result.current.nodes.map((node) => node.id));
    const proposal: Extract<AiProposal, { kind: "add-child" }> = {
      key: addChildProposalKey(1, "新", 0),
      kind: "add-child",
      parentId: 1,
      label: "新",
      baseline: {
        parentId: 1,
        inputFingerprint: structureInputFingerprintOf(result.current.nodes, 1, "child-candidates")!,
        assistKind: "child-candidates",
      },
    };
    let outcome!: AiStructureApplyOutcome;
    act(() => { result.current.selectRelation(10); });
    act(() => {
      outcome = result.current.applyAiStructureProposals([{ proposal }], visible, MAP_ID);
    });
    expect(outcome).toEqual({ ok: false, reason: "rejected" });
    expect(result.current.nodes.some((node) => node.label === "新")).toBe(false);
    expect(result.current.canUndo).toBe(false);
  });

  it("buildDuplicatePairProposals 経由の merge-pair を適用する（非空ラベル2件）", () => {
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.replaceMap({
        layoutMode: "manual",
        nodes: [
          createTestNode({ id: 1, label: "根" }),
          createTestNode({ id: 2, parentId: 1, label: "似た", x: 100, y: 80 }),
          createTestNode({ id: 3, parentId: 1, label: "似た", x: 100, y: 160 }),
        ],
        relations: [],
      });
    });
    const nodes = result.current.nodes;
    const visible = new Set(nodes.map((node) => node.id));
    const [built] = buildDuplicatePairProposals(
      nodes,
      [{ primaryId: 2, secondaryId: 3, reason: "類似" }],
      visible,
      MAP_ID,
    );
    if (built === undefined || built.kind !== "merge-pair") throw new Error("前提");
    let outcome!: AiStructureApplyOutcome;
    act(() => {
      outcome = result.current.applyAiStructureProposals([{ proposal: built }], visible, MAP_ID);
    });
    expect(outcome).toEqual({ ok: true, appliedCount: 1 });
    expect(nodes.some((node) => node.id === 3)).toBe(true);
    expect(result.current.nodes.some((node) => node.id === 3)).toBe(false);
    expect(result.current.nodes.find((node) => node.id === 2)?.label).toBe("似た 似た");
  });
});