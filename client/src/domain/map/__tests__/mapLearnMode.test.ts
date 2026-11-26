import {
  LEARN_LABEL_PLACEHOLDER,
  applyLearnToState,
  resetLearnProgressState,
  resolveLearnLabelDisplay,
  revealNodeInLearn,
} from "@/domain/map/mapLearnMode";
import { createTestNode } from "@/testing/createTestNode";
import type { NodeMapState } from "@/types/nodeMapState";
import { MAP_LEARN_VERSION } from "@/types/mapLearn";

function baseState(extra: Partial<NodeMapState> = {}): NodeMapState {
  return {
    layoutMode: "manual",
    nodes: [createTestNode({ id: 1, label: "秘密" })],
    ...extra,
  };
}

describe("resolveLearnLabelDisplay", () => {
  const node = createTestNode({ id: 1, label: "秘密" });
  const revealed = new Set<number>();

  it("学習外は実ラベル（revealed があっても）", () => {
    expect(resolveLearnLabelDisplay(node, {
      learningActive: false,
      revealedNodeIds: new Set([1]),
    })).toEqual({ text: "秘密", realLabelForWidth: "秘密" });
  });

  it("学習中かつ未開示はプレースホルダ、幅用は実ラベル", () => {
    expect(resolveLearnLabelDisplay(node, { learningActive: true, revealedNodeIds: revealed })).toEqual({
      text: LEARN_LABEL_PLACEHOLDER,
      realLabelForWidth: "秘密",
    });
  });

  it("学習中かつ開示済みは実ラベル", () => {
    expect(resolveLearnLabelDisplay(node, {
      learningActive: true,
      revealedNodeIds: new Set([1]),
    })).toEqual({ text: "秘密", realLabelForWidth: "秘密" });
  });
});

describe("revealNodeInLearn", () => {
  it("既開示なら null", () => {
    const state = baseState({
      learn: { version: MAP_LEARN_VERSION, revealedNodeIds: [1] },
    });
    expect(revealNodeInLearn(state, 1)).toBeNull();
  });

  it("追加して昇順ソート", () => {
    const state = baseState({
      learn: { version: MAP_LEARN_VERSION, revealedNodeIds: [3] },
    });
    expect(revealNodeInLearn(state, 1)?.revealedNodeIds).toEqual([1, 3]);
  });
});

describe("resetLearnProgressState", () => {
  it("cards を保持して revealed を空にする", () => {
    const card = { id: "c1", prompt: "p", answer: "a", sourceNodeIds: [1] as const };
    const state = baseState({
      learn: { version: MAP_LEARN_VERSION, revealedNodeIds: [1], cards: [card] },
    });
    expect(resetLearnProgressState(state)).toEqual({
      version: MAP_LEARN_VERSION,
      revealedNodeIds: [],
      cards: [card],
    });
  });
});

describe("applyLearnToState", () => {
  it("空進捗なら learn を落とす", () => {
    const next = applyLearnToState(baseState(), {
      version: MAP_LEARN_VERSION,
      revealedNodeIds: [],
    });
    expect(next.learn).toBeUndefined();
  });
});