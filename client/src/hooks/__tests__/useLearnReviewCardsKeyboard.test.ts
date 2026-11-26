import { fireEvent, renderHook } from "@testing-library/react";
import { useLearnReviewCardsKeyboard } from "@/hooks/useLearnReviewCardsKeyboard";

describe("useLearnReviewCardsKeyboard", () => {
  it("有効時に Space で表裏・矢印で前後を呼ぶ", () => {
    const onFlip = jest.fn();
    const onPrevious = jest.fn();
    const onNext = jest.fn();
    renderHook(() =>
      useLearnReviewCardsKeyboard({ enabled: true, onFlip, onPrevious, onNext }),
    );

    fireEvent.keyDown(window, { key: " ", code: "Space" });
    expect(onFlip).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onPrevious).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("入力フォーカス中はキーを奪わない", () => {
    const onFlip = jest.fn();
    renderHook(() =>
      useLearnReviewCardsKeyboard({
        enabled: true,
        onFlip,
        onPrevious: jest.fn(),
        onNext: jest.fn(),
      }),
    );
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    fireEvent.keyDown(input, { key: " ", code: "Space" });
    expect(onFlip).not.toHaveBeenCalled();
    input.remove();
  });

  it("ボタンフォーカス中はキーを奪わない", () => {
    const onFlip = jest.fn();
    const onPrevious = jest.fn();
    renderHook(() =>
      useLearnReviewCardsKeyboard({
        enabled: true,
        onFlip,
        onPrevious,
        onNext: jest.fn(),
      }),
    );
    const button = document.createElement("button");
    button.type = "button";
    document.body.append(button);
    button.focus();
    fireEvent.keyDown(button, { key: " ", code: "Space" });
    expect(onFlip).not.toHaveBeenCalled();
    fireEvent.keyDown(button, { key: "ArrowLeft" });
    expect(onPrevious).not.toHaveBeenCalled();
    button.remove();
  });
});