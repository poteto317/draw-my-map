import { act, renderHook } from "@testing-library/react";
import {
  createMapDocument,
  parseMapDocumentJson,
  serializeMapDocument,
} from "@/domain/persistence/mapDocumentCodec";
import { mapDocumentOptionsFromState } from "@/domain/persistence/mapDocumentState";
import { LEARN_LABEL_PLACEHOLDER, resolveLearnLabelDisplay } from "@/domain/map/mapLearnMode";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";
import type { NodeMapState } from "@/types/nodeMapState";
import { MAP_LEARN_VERSION } from "@/types/mapLearn";

const guardBase = {
  learningActive: true,
  playingPresentation: false,
  isProtectedMode: false,
  hasConflict: false,
  isExternallyDeleted: false,
  selectedNodeIds: [1] as const,
  revealedNodeIds: new Set<number>(),
};

function baseState(extra: Partial<NodeMapState> = {}): NodeMapState {
  return {
    layoutMode: "manual",
    nodes: [createTestNode({ id: 1, label: "秘密" })],
    ...extra,
  };
}

function renderNodes(initial: NodeMapState) {
  const view = renderHook(() => useNodes());
  act(() => {
    view.result.current.replaceMap(initial);
    view.result.current.selectNode(1);
  });
  return view;
}

describe("useNodes learn", () => {
  it("開示は 1 Undo で戻せる", () => {
    const { result } = renderNodes(baseState());
    act(() => {
      expect(result.current.revealLearnNode(1, guardBase)).toEqual({ ok: true });
    });
    expect(result.current.learn?.revealedNodeIds).toEqual([1]);
    act(() => expect(result.current.undo()).toBe(true));
    expect(result.current.learn?.revealedNodeIds ?? []).toEqual([]);
  });

  it("保存→再読込後も開示状態が残り、学習外は実ラベル・学習再開で開示だけ実ラベル", () => {
    const { result } = renderNodes(baseState());
    act(() => {
      expect(result.current.revealLearnNode(1, guardBase)).toEqual({ ok: true });
    });
    const node = result.current.nodes[0]!;
    const state = {
      layoutMode: result.current.layoutMode,
      learn: result.current.learn,
    } satisfies Partial<NodeMapState>;
    const json = serializeMapDocument(createMapDocument(result.current.nodes, result.current.layoutMode, {
      ...mapDocumentOptionsFromState(state),
    }));
    const parsed = parseMapDocumentJson(json);
    expect(parsed.ok && parsed.value.learn?.revealedNodeIds).toEqual([1]);

    const inactive = resolveLearnLabelDisplay(node, {
      learningActive: false,
      revealedNodeIds: new Set([1]),
    });
    expect(inactive.text).toBe("秘密");

    const hiddenBeforeReveal = resolveLearnLabelDisplay(node, {
      learningActive: true,
      revealedNodeIds: new Set(),
    });
    expect(hiddenBeforeReveal.text).toBe(LEARN_LABEL_PLACEHOLDER);

    const revealedInLearn = resolveLearnLabelDisplay(node, {
      learningActive: true,
      revealedNodeIds: new Set([1]),
    });
    expect(revealedInLearn.text).toBe("秘密");
  });

  it("復習カード生成は 1 Undo・0 件は undo 増えない", () => {
    const { result } = renderNodes(baseState({
      nodes: [
        createTestNode({ id: 1, label: "親" }),
        createTestNode({ id: 2, parentId: 1, label: "子" }),
      ],
    }));
    act(() => {
      expect(result.current.generateLearnReviewCards(guardBase)).toEqual({ ok: true });
    });
    expect(result.current.learn?.cards?.length).toBe(1);
    act(() => expect(result.current.undo()).toBe(true));
    expect(result.current.learn?.cards).toBeUndefined();

    act(() => {
      result.current.replaceMap(baseState({
        nodes: [createTestNode({ id: 1, label: "  " })],
      }));
    });
    act(() => {
      expect(result.current.generateLearnReviewCards(guardBase)).toEqual({ ok: false, reason: "no-cards" });
    });
    expect(result.current.canUndo).toBe(false);
  });

  it("保護中は進捗リセット不可", () => {
    const { result } = renderNodes(baseState({
      learn: { version: MAP_LEARN_VERSION, revealedNodeIds: [1] },
    }));
    act(() => {
      expect(result.current.resetLearnProgress({
        ...guardBase,
        isProtectedMode: true,
      })).toEqual({ ok: false, reason: "protected" });
    });
    expect(result.current.learn?.revealedNodeIds).toEqual([1]);
  });
});