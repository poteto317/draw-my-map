import { act, renderHook } from "@testing-library/react";
import { useMapLearnMode } from "@/hooks/useMapLearnMode";

describe("useMapLearnMode", () => {
  it("プレゼン中は開始できない", () => {
    const { result } = renderHook(() => useMapLearnMode({
      playingPresentation: true,
      isProtectedMode: false,
      hasConflict: false,
      isExternallyDeleted: false,
    }));
    expect(result.current.start()).toEqual({ ok: false, reason: "presentation" });
  });

  it("開始と終了はメモリのみ", () => {
    const { result } = renderHook(() => useMapLearnMode({
      playingPresentation: false,
      isProtectedMode: false,
      hasConflict: false,
      isExternallyDeleted: false,
    }));
    act(() => {
      expect(result.current.start()).toEqual({ ok: true });
    });
    expect(result.current.learningActive).toBe(true);
    act(() => {
      expect(result.current.end()).toBe(true);
    });
    expect(result.current.learningActive).toBe(false);
  });

  it("復習カードパネルは表裏めくりと前後をメモリで保持する", () => {
    const { result } = renderHook(() => useMapLearnMode({
      playingPresentation: false,
      isProtectedMode: false,
      hasConflict: false,
      isExternallyDeleted: false,
    }));
    act(() => {
      result.current.start();
    });
    act(() => {
      result.current.openReviewCardsPanel();
    });
    expect(result.current.reviewCardsPanelOpen).toBe(true);
    act(() => {
      result.current.flipReviewCard();
    });
    expect(result.current.reviewCardShowingAnswer).toBe(true);
    act(() => {
      result.current.goReviewCardNext(3);
    });
    expect(result.current.reviewCardIndex).toBe(1);
    act(() => {
      result.current.goReviewCardPrevious(3);
    });
    expect(result.current.reviewCardIndex).toBe(0);
    expect(result.current.reviewCardShowingAnswer).toBe(false);
  });
});