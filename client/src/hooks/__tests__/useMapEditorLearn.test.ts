import { act, renderHook } from "@testing-library/react";
import { useMapEditorLearn } from "@/hooks/useMapEditorLearn";

const revealOk = () => ({ ok: true } as const);
const revealFail = () => ({ ok: false, reason: "not-learning" } as const);

function mountHook(overrides: Partial<Parameters<typeof useMapEditorLearn>[0]> = {}) {
  const revealLearnNode = jest.fn(revealOk);
  const resetLearnProgress = jest.fn(revealOk);
  const generateLearnReviewCards = jest.fn(revealOk);
  const selectNode = jest.fn();
  const props = {
    learn: undefined,
    documentRevision: 1,
    playingPresentation: false,
    storageMode: "persistent" as const,
    conflictState: "none" as const,
    selectedNodeId: 1,
    selectedNodeIds: [1] as const,
    revealLearnNode,
    resetLearnProgress,
    generateLearnReviewCards,
    selectNode,
    ...overrides,
  };
  const hook = renderHook(() => useMapEditorLearn(props));
  return { ...hook, revealLearnNode, resetLearnProgress, generateLearnReviewCards, selectNode };
}

describe("useMapEditorLearn", () => {
  it("競合中は学習開始が blocked 理由を返す", () => {
    const { result } = mountHook({ conflictState: "conflict" });
    expect(result.current.learnStartBlockedReason).toMatch(/競合/);
    expect(result.current.learningActive).toBe(false);
  });

  it("学習開始に成功すると learningActive になる", () => {
    const { result } = mountHook();
    act(() => {
      result.current.handleToggleLearnMode();
    });
    expect(result.current.learningActive).toBe(true);
    expect(result.current.learnDisplay.learningActive).toBe(true);
  });

  it("プレゼン再生中は学習開始が拒否される", () => {
    const { result } = mountHook({ playingPresentation: true });
    act(() => {
      result.current.startLearnFromPalette();
    });
    expect(result.current.learningActive).toBe(false);
    expect(result.current.learnNotice).not.toBeNull();
  });

  it("音声入力中は学習開始が拒否される", () => {
    const { result } = mountHook({ voiceListening: true });
    expect(result.current.learnStartBlockedReason).toMatch(/音声入力中/);
    act(() => {
      result.current.startLearnFromPalette();
    });
    expect(result.current.learningActive).toBe(false);
    expect(result.current.learnNotice?.message).toMatch(/音声入力中/);
  });

  it("パレット用 start/end とトグルが同じ開始経路を使う", () => {
    const { result } = mountHook();
    act(() => {
      expect(result.current.startLearnFromPalette()).toBe(true);
    });
    expect(result.current.learningActive).toBe(true);
    act(() => {
      expect(result.current.endLearnFromPalette()).toBe(true);
    });
    expect(result.current.learningActive).toBe(false);
  });

  it("学習中に同じノードを再選択すると開示を試みる", () => {
    const { result, revealLearnNode } = mountHook();
    act(() => {
      result.current.startLearnFromPalette();
    });
    act(() => {
      result.current.handleSelectNodeWithLearn(1);
    });
    expect(revealLearnNode).toHaveBeenCalledWith(1, expect.objectContaining({ learningActive: true }));
  });

  it("開示失敗時は通知を出す", () => {
    const revealLearnNode = jest.fn(revealFail);
    const { result } = mountHook({ revealLearnNode });
    act(() => {
      result.current.startLearnFromPalette();
    });
    act(() => {
      expect(result.current.attemptRevealLearnNode(1)).toBe(false);
    });
    expect(result.current.learnNotice).not.toBeNull();
  });
});