import { renderHook } from "@testing-library/react";
import { useMapLearnActions } from "@/hooks/useMapLearnActions";
import type { StateChange } from "@/hooks/useNodeLayoutState";
import { createTestNode } from "@/testing/createTestNode";
import type { NodeMapState } from "@/types/nodeMapState";
import { MAP_LEARN_VERSION } from "@/types/mapLearn";
import type { Node } from "@/types/node";

function baseState(extra: Partial<NodeMapState> = {}): NodeMapState {
  return {
    layoutMode: "manual",
    nodes: [createTestNode({ id: 1, label: "根" })],
    ...extra,
  };
}

function mockApply(applied: boolean, present: NodeMapState) {
  return (update: StateChange) => {
    const next = update(present, {});
    if (!next) return false;
    return applied;
  };
}

const guardBase = {
  learningActive: true,
  playingPresentation: false,
  isProtectedMode: false,
  hasConflict: false,
  isExternallyDeleted: false,
  selectedNodeIds: [1] as const,
};

describe("useMapLearnActions", () => {
  it("開示は applyStateChange 経由で 1 回の文書変更になる", () => {
    let present = baseState();
    const { result } = renderHook(() =>
      useMapLearnActions({
        applyStateChangeRaw: (update) => {
          const next = update(present, {});
          if (!next) return false;
          present = next;
          return true;
        },
      }),
    );
    expect(result.current.revealLearnNode(1, { ...guardBase, revealedNodeIds: new Set() })).toEqual({ ok: true });
    expect(present.learn?.revealedNodeIds).toEqual([1]);
  });

  it("apply が false なら placement-failed", () => {
    const present = baseState();
    const { result } = renderHook(() =>
      useMapLearnActions({ applyStateChangeRaw: mockApply(false, present) }),
    );
    expect(result.current.revealLearnNode(1, { ...guardBase, revealedNodeIds: new Set() })).toEqual({
      ok: false,
      reason: "placement-failed",
    });
  });

  it("カード生成は applyStateChange で全置換し、0 件は文書不変", () => {
    const nodes: Node[] = [
      createTestNode({ id: 1, label: "親" }),
      createTestNode({ id: 2, parentId: 1, label: "子" }),
    ];
    let present = baseState({ nodes });
  let applyCount = 0;
    const { result } = renderHook(() =>
      useMapLearnActions({
        applyStateChangeRaw: (update) => {
          const next = update(present, {});
          if (!next) return false;
          present = next;
          applyCount += 1;
          return true;
        },
      }),
    );
    expect(result.current.generateLearnReviewCards(nodes, guardBase)).toEqual({ ok: true });
    expect(present.learn?.cards?.length).toBe(1);
    expect(applyCount).toBe(1);

    const emptyNodes = [createTestNode({ id: 1, label: "  " })];
    present = baseState({ nodes: emptyNodes });
    applyCount = 0;
    expect(result.current.generateLearnReviewCards(emptyNodes, guardBase)).toEqual({
      ok: false,
      reason: "no-cards",
    });
    expect(applyCount).toBe(0);
    expect(present.learn).toBeUndefined();
  });

  it("保護モードではリセット不可", () => {
    const present = baseState({ learn: { version: MAP_LEARN_VERSION, revealedNodeIds: [1] } });
    const { result } = renderHook(() =>
      useMapLearnActions({ applyStateChangeRaw: mockApply(true, present) }),
    );
    expect(result.current.resetLearnProgress({ ...guardBase, isProtectedMode: true })).toEqual({
      ok: false,
      reason: "protected",
    });
  });
});