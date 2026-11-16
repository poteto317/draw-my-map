import { render, screen } from "@testing-library/react";
import { useRef } from "react";
import { useHeaderFocusReturn } from "@/hooks/useHeaderFocusReturn";

type HarnessProps = {
  focusRequest: string | null;
  buttonDisabled?: boolean;
  hasButton?: boolean;
  fallbackDisabled?: boolean;
  secondFallback?: boolean;
  onConsume: () => void;
};

function Harness({
  focusRequest,
  buttonDisabled = false,
  hasButton = true,
  fallbackDisabled = false,
  secondFallback = false,
  onConsume,
}: HarnessProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const fallbackRef = useRef<HTMLButtonElement>(null);
  const secondFallbackRef = useRef<HTMLButtonElement>(null);
  useHeaderFocusReturn({
    focusRequest,
    consumeFocusRequest: onConsume,
    buttonRef,
    fallbackRefs: secondFallback ? [fallbackRef, secondFallbackRef] : [fallbackRef],
  });
  return (
    <>
      {hasButton && <button ref={buttonRef} disabled={buttonDisabled}>対象のボタン</button>}
      <button ref={fallbackRef} disabled={fallbackDisabled}>戻り先のボタン</button>
      {secondFallback && <button ref={secondFallbackRef}>2 番目の戻り先のボタン</button>}
    </>
  );
}

describe("useHeaderFocusReturn", () => {
  it("header の要求でヘッダーのボタンへフォーカスし、要求を消費する", () => {
    const onConsume = jest.fn();

    render(<Harness focusRequest="header" onConsume={onConsume} />);

    expect(screen.getByRole("button", { name: "対象のボタン" })).toHaveFocus();
    expect(onConsume).toHaveBeenCalledTimes(1);
  });

  it("ボタンが無効なら、常に押せる戻り先のボタンへフォーカスする", () => {
    const onConsume = jest.fn();

    render(<Harness focusRequest="header" buttonDisabled onConsume={onConsume} />);

    expect(screen.getByRole("button", { name: "戻り先のボタン" })).toHaveFocus();
    expect(onConsume).toHaveBeenCalledTimes(1);
  });

  it("ボタンが描画されていなければ、戻り先のボタンへフォーカスする", () => {
    render(<Harness focusRequest="header" hasButton={false} onConsume={jest.fn()} />);

    expect(screen.getByRole("button", { name: "戻り先のボタン" })).toHaveFocus();
  });

  it("ボタンも先頭の戻り先も無効なら、次の戻り先のボタンへフォーカスする", () => {
    const onConsume = jest.fn();

    render(<Harness focusRequest="header" buttonDisabled fallbackDisabled secondFallback onConsume={onConsume} />);

    expect(screen.getByRole("button", { name: "2 番目の戻り先のボタン" })).toHaveFocus();
    expect(onConsume).toHaveBeenCalledTimes(1);
  });

  it("ボタンが無効で先頭の戻り先が有効なら、2 番目へは送らない", () => {
    render(<Harness focusRequest="header" buttonDisabled secondFallback onConsume={jest.fn()} />);

    expect(screen.getByRole("button", { name: "戻り先のボタン" })).toHaveFocus();
  });

  it("すべて無効ならフォーカスを動かさず、要求は消費する", () => {
    const onConsume = jest.fn();

    render(<Harness focusRequest="header" buttonDisabled fallbackDisabled onConsume={onConsume} />);

    expect(document.body).toHaveFocus();
    expect(onConsume).toHaveBeenCalledTimes(1);
  });

  it.each([null, "separator"])("要求が %s のときは、フォーカスを動かさず、要求も消費しない", (focusRequest) => {
    const onConsume = jest.fn();

    render(<Harness focusRequest={focusRequest} onConsume={onConsume} />);

    expect(document.body).toHaveFocus();
    expect(onConsume).not.toHaveBeenCalled();
  });

  it("要求が header に変わった描画でフォーカスする", () => {
    const onConsume = jest.fn();
    const { rerender } = render(<Harness focusRequest={null} onConsume={onConsume} />);

    rerender(<Harness focusRequest="header" onConsume={onConsume} />);

    expect(screen.getByRole("button", { name: "対象のボタン" })).toHaveFocus();
  });
});
