import { fireEvent, renderHook } from "@testing-library/react";
import { useLearnRevealKeyboard } from "@/hooks/useLearnRevealKeyboard";

describe("useLearnRevealKeyboard", () => {
  it("学習中のみ Enter で開示ハンドラを呼ぶ", () => {
    const onReveal = jest.fn();
    const { rerender } = renderHook(
      ({ enabled }) => useLearnRevealKeyboard({ enabled, onReveal }),
      { initialProps: { enabled: false } },
    );
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onReveal).not.toHaveBeenCalled();

    rerender({ enabled: true });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onReveal).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Enter", repeat: true });
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it("入力フォーカス中は Enter を奪わない", () => {
    const onReveal = jest.fn();
    renderHook(() => useLearnRevealKeyboard({ enabled: true, onReveal }));
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onReveal).not.toHaveBeenCalled();
    input.remove();
  });
});