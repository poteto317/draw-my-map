import { classifyReorderSimLayoutFromState, validateClassifyReorderOutput } from "@/domain/aiAssist/aiAssistOutput";
import {
  addChildProposalKey,
  addSiblingProposalKey,
  applyAiStructureProposals,
  buildChildCandidateProposals,
  buildClassifyReorderProposals,
  buildDuplicatePairProposals,
  findStaleAiStructureProposals,
  mergePairProposalKey,
  reorderSiblingsProposalKey,
  reparentProposalKey,
  structureInputFingerprintOf,
  type AcceptedAiStructureProposal,
} from "@/domain/aiAssist/aiStructureProposal";
import { collectSubtreeIds } from "@/domain/nodes/nodeTree";
import type { AiProposal } from "@/domain/aiAssist/aiProposal";
import { MERGE_DEFAULT_SEPARATOR } from "@/domain/nodes/nodeSeparator";
import { directChildIdsInArrayOrder } from "@/domain/nodes/reorderAllSiblings";
import { planNodeMerge } from "@/domain/nodes/nodeMerge";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";
import type { NodeMapState } from "@/types/nodeMapState";

const MAP_ID = "map-1";
const ALL = new Set([1, 2, 3, 4, 5, 6, 9]);

function baseState(nodes: Node[]): NodeMapState {
  return { layoutMode: "manual", nodes };
}

function fingerprint(nodes: readonly Node[], rootId: number) {
  return structureInputFingerprintOf(nodes, rootId, "classify-reorder")!;
}

function reparentProposal(nodes: readonly Node[], nodeId: number, newParentId: number): Extract<AiProposal, { kind: "reparent" }> {
  const node = nodes.find((item) => item.id === nodeId)!;
  return {
    key: reparentProposalKey(nodeId, newParentId),
    kind: "reparent",
    nodeId,
    newParentId,
    baseline: {
      nodeId,
      oldParentId: node.parentId,
      label: node.label,
      inputFingerprint: fingerprint(nodes, nodeId),
      assistKind: "classify-reorder",
    },
  };
}

function mergeProposal(nodes: readonly Node[], primaryId: number, secondaryId: number): Extract<AiProposal, { kind: "merge-pair" }> {
  const primary = nodes.find((node) => node.id === primaryId)!;
  const secondary = nodes.find((node) => node.id === secondaryId)!;
  const expectedPlan = planNodeMerge(nodes, [primaryId, secondaryId], primaryId, MERGE_DEFAULT_SEPARATOR, ALL, MAP_ID);
  if (!expectedPlan.ok) throw new Error("前提");
  return {
    key: mergePairProposalKey(primaryId, secondaryId),
    kind: "merge-pair",
    primaryId,
    secondaryId,
    reason: "類似",
    baseline: {
      primaryId,
      secondaryId,
      primaryLabel: primary.label,
      secondaryLabel: secondary.label,
      parentId: primary.parentId,
      inputFingerprint: structureInputFingerprintOf(nodes, primaryId, "duplicates")!,
      assistKind: "duplicates",
    },
    expectedPlan,
  };
}

describe("findStaleAiStructureProposals", () => {
  const nodes = [
    createTestNode({ id: 1, label: "根" }),
    createTestNode({ id: 2, parentId: 1, label: "A" }),
    createTestNode({ id: 3, parentId: 1, label: "B" }),
  ];
  const rebuild = (rootId: number, kind: Parameters<typeof structureInputFingerprintOf>[2]) =>
    structureInputFingerprintOf(nodes, rootId, kind);

  it("reparent は親またはラベルが変わると古い", () => {
    const proposal = reparentProposal(nodes, 2, 1);
    expect(findStaleAiStructureProposals(baseState(nodes), [proposal], rebuild)).toEqual([]);
    const relabeled = nodes.map((node) => (node.id === 2 ? { ...node, label: "A2" } : node));
    expect(findStaleAiStructureProposals(baseState(relabeled), [proposal], rebuild)).toEqual([proposal.key]);
  });
});

describe("applyAiStructureProposals", () => {
  function apply(state: NodeMapState, accepted: AcceptedAiStructureProposal[], nextId = 50) {
    let cursor = nextId;
    return applyAiStructureProposals({
      state,
      accepted,
      rebuildInputFingerprint: (rootId, kind) => structureInputFingerprintOf(state.nodes, rootId, kind),
      allocateNodeIds: (count) => Array.from({ length: count }, () => cursor += 1),
      mergeJoiner: MERGE_DEFAULT_SEPARATOR,
      visibleNodeIds: ALL,
      currentMapId: MAP_ID,
    });
  }

  it("1 件でも古ければ全体を変えない", () => {
    const nodes = [
      createTestNode({ id: 1, label: "根" }),
      createTestNode({ id: 2, parentId: 1, label: "A" }),
      createTestNode({ id: 3, parentId: 1, label: "B" }),
    ];
    const stale = reparentProposal(nodes, 2, 1);
  const changed = nodes.map((node) => (node.id === 2 ? { ...node, label: "A*" } : node));
    const result = applyAiStructureProposals({
      state: baseState(changed),
      accepted: [{ proposal: stale }, { proposal: reparentProposal(changed, 3, 2) }],
      rebuildInputFingerprint: (rootId, kind) => structureInputFingerprintOf(changed, rootId, kind),
      allocateNodeIds: () => [9],
      mergeJoiner: MERGE_DEFAULT_SEPARATOR,
      visibleNodeIds: ALL,
      currentMapId: MAP_ID,
    });
    expect(result).toEqual({ ok: false, reason: "stale", staleKeys: [stale.key] });
  });

  it("merge → reparent → reorder → add-child の順で適用する", () => {
    const nodes = [
      createTestNode({ id: 1, label: "根" }),
      createTestNode({ id: 2, parentId: 1, label: "似た" }),
      createTestNode({ id: 3, parentId: 1, label: "似た" }),
      createTestNode({ id: 4, parentId: 1, label: "枝", x: 100, y: 220 }),
      createTestNode({ id: 5, parentId: 4, label: "葉" }),
    ];
    const state = baseState(nodes);
    const merge = mergeProposal(nodes, 2, 3);
    const reparent = reparentProposal(nodes, 5, 1);
    const reorder: Extract<AiProposal, { kind: "reorder-siblings" }> = {
      key: reorderSiblingsProposalKey(1, [2, 4]),
      kind: "reorder-siblings",
      parentId: 1,
      childIds: [4, 5, 2],
      baseline: {
        parentId: 1,
        childIdsBefore: directChildIdsInArrayOrder(nodes, 1),
        inputFingerprint: fingerprint(nodes, 1),
        assistKind: "classify-reorder",
      },
    };
    const addChild: Extract<AiProposal, { kind: "add-child" }> = {
      key: addChildProposalKey(1, "追加", 0),
      kind: "add-child",
      parentId: 1,
      label: "追加",
      baseline: {
        parentId: 1,
        inputFingerprint: structureInputFingerprintOf(nodes, 1, "child-candidates")!,
        assistKind: "child-candidates",
      },
    };

    const result = apply(state, [
      { proposal: addChild },
      { proposal: reorder },
      { proposal: reparent },
      { proposal: merge },
    ]);

    if (!result.ok) throw new Error(JSON.stringify(result));
    const mergedIds = result.state.nodes.map((node) => node.id);
    expect(mergedIds).toContain(2);
    expect(mergedIds).not.toContain(3);
    expect(result.state.nodes.find((node) => node.id === 5)?.parentId).toBe(1);
    expect(directChildIdsInArrayOrder(result.state.nodes, 1)).toEqual([4, 5, 2, 51]);
    expect(result.state.nodes.find((node) => node.id === 51)?.label).toBe("追加");
    expect(result.appliedCount).toBe(4);
  });

  it("reorder が unchanged でも後続の add-child を適用する", () => {
    const nodes = [
      createTestNode({ id: 1, label: "根" }),
      createTestNode({ id: 2, parentId: 1, label: "A" }),
      createTestNode({ id: 3, parentId: 1, label: "B" }),
    ];
    const childIds = directChildIdsInArrayOrder(nodes, 1);
    const reorder: Extract<AiProposal, { kind: "reorder-siblings" }> = {
      key: reorderSiblingsProposalKey(1, childIds),
      kind: "reorder-siblings",
      parentId: 1,
      childIds,
      baseline: {
        parentId: 1,
        childIdsBefore: childIds,
        inputFingerprint: fingerprint(nodes, 1),
        assistKind: "classify-reorder",
      },
    };
    const addChild: Extract<AiProposal, { kind: "add-child" }> = {
      key: addChildProposalKey(1, "追加", 0),
      kind: "add-child",
      parentId: 1,
      label: "追加",
      baseline: {
        parentId: 1,
        inputFingerprint: structureInputFingerprintOf(nodes, 1, "child-candidates")!,
        assistKind: "child-candidates",
      },
    };

    const result = apply(baseState(nodes), [{ proposal: reorder }, { proposal: addChild }]);

    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.appliedCount).toBe(1);
    expect(result.state.nodes.find((node) => node.id === 51)?.label).toBe("追加");
  });

  it("add-sibling は基準の直後に挿入する", () => {
    const nodes = [
      createTestNode({ id: 1, label: "根" }),
      createTestNode({ id: 2, parentId: 1, label: "A", x: 100, y: 80 }),
      createTestNode({ id: 3, parentId: 1, label: "B", x: 100, y: 160 }),
    ];
    const proposal: Extract<AiProposal, { kind: "add-sibling" }> = {
      key: addSiblingProposalKey(2, "弟", 0),
      kind: "add-sibling",
      anchorId: 2,
      label: "弟",
      baseline: {
        anchorId: 2,
        parentId: 1,
        inputFingerprint: structureInputFingerprintOf(nodes, 2, "missing-perspectives")!,
        assistKind: "missing-perspectives",
      },
    };
    const result = apply(baseState(nodes), [{ proposal }]);
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.state.nodes.map((node) => node.id)).toEqual([1, 2, 51, 3]);
  });

  it("失敗すると部分適用しない", () => {
    const nodes = [
      createTestNode({ id: 1, label: "根" }),
      createTestNode({ id: 2, parentId: 1, label: "A" }),
    ];
    const proposal = reparentProposal(nodes, 2, 99);
    const result = apply(baseState(nodes), [{ proposal }]);
    expect(result).toEqual({ ok: false, reason: "placement-failed" });
  });

  it("079 検証済みの reparent+reorder を一括適用できる", () => {
    const nodes = [
      createTestNode({ id: 1, label: "根" }),
      createTestNode({ id: 2, parentId: 1, label: "子A" }),
      createTestNode({ id: 3, parentId: 1, label: "子B" }),
    ];
    const branchIds = collectSubtreeIds(nodes, 1);
    const validated = validateClassifyReorderOutput({
      moves: [
        { type: "reparent", nodeId: 3, newParentId: 2 },
        { type: "reorder", parentId: 1, childIds: [2] },
      ],
    }, branchIds, nodes, classifyReorderSimLayoutFromState({ layoutMode: "manual" }));
    if (!validated.ok) throw new Error("validated");
    const proposals = buildClassifyReorderProposals(nodes, validated.moves);
    const result = apply(
      baseState(nodes),
      proposals.map((proposal) => ({ proposal })) as AcceptedAiStructureProposal[],
    );
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(directChildIdsInArrayOrder(result.state.nodes, 1)).toEqual([2]);
    expect(result.state.nodes.find((node) => node.id === 3)?.parentId).toBe(2);
  });
});

describe("buildChildCandidateProposals", () => {
  it("同一ラベルでも key は index で一意になる", () => {
    const nodes = [
      createTestNode({ id: 1, label: "根" }),
      createTestNode({ id: 2, parentId: 1, label: "子" }),
    ];
    const proposals = buildChildCandidateProposals(nodes, 1, [{ label: "同じ" }, { label: "同じ" }]);
    expect(proposals.map((item) => item.key)).toEqual([
      addChildProposalKey(1, "同じ", 0),
      addChildProposalKey(1, "同じ", 1),
    ]);
  });
});

describe("buildDuplicatePairProposals", () => {
  it("expectedPlan の joiner は MERGE_DEFAULT_SEPARATOR と一致する", () => {
    const nodes = [
      createTestNode({ id: 1, label: "根" }),
      createTestNode({ id: 2, parentId: 1, label: "似た" }),
      createTestNode({ id: 3, parentId: 1, label: "似た" }),
    ];
    const [proposal] = buildDuplicatePairProposals(
      nodes,
      [{ primaryId: 2, secondaryId: 3, reason: "類似" }],
      ALL,
      MAP_ID,
    );
    if (proposal === undefined) throw new Error("前提");
    expect(proposal.kind).toBe("merge-pair");
    if (proposal.kind !== "merge-pair") return;
    const plan = planNodeMerge(nodes, [2, 3], 2, MERGE_DEFAULT_SEPARATOR, ALL, MAP_ID);
    expect(proposal.expectedPlan).toEqual(plan);
  });
});