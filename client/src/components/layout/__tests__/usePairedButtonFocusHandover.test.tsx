import { render, screen } from "@testing-library/react";
import { usePairedButtonFocusHandover } from "@/components/layout/usePairedButtonFocusHandover";

function Pair({ first, second }: { first: boolean; second: boolean }) {
  const { firstRef, secondRef, handleFocus, handleBlur } = usePairedButtonFocusHandover(first, second);
  return (
    <div>
      <button type="button" ref={firstRef} onFocus={handleFocus} onBlur={handleBlur} disabled={!first}>
        一
      </button>
      <button type="button" ref={secondRef} onFocus={handleFocus} onBlur={handleBlur} disabled={!second}>
        二
      </button>
      <input aria-label="外" />
    </div>
  );
}

function getFirst() {
  return screen.getByRole("button", { name: "一" });
}

function getSecond() {
  return screen.getByRole("button", { name: "二" });
}

describe("usePairedButtonFocusHandover", () => {
  it("一にフォーカスがあって一が無効になると、二へフォーカスを移す", () => {
    const { rerender } = render(<Pair first second />);
    getFirst().focus();

    rerender(<Pair first={false} second />);

    expect(document.activeElement).toBe(getSecond());
  });

  it("二にフォーカスがあって二が無効になると、一へフォーカスを移す", () => {
    const { rerender } = render(<Pair first second />);
    getSecond().focus();

    rerender(<Pair first second={false} />);

    expect(document.activeElement).toBe(getFirst());
  });

  it("一が無効になって二へ移した後、二を押して二も端で無効になったら、一へ戻す", () => {
    const { rerender } = render(<Pair first second />);
    getFirst().focus();

    rerender(<Pair first={false} second />);
    expect(document.activeElement).toBe(getSecond());

    // 移した先の二をそのまま押すと、二が端に着いて無効になり、一が有効に戻る
    rerender(<Pair first second={false} />);

    expect(document.activeElement).toBe(getFirst());
  });

  it("両方が無効になったら移さず、記録も捨てて、後で二が有効になっても奪わない", () => {
    const { rerender } = render(<Pair first second />);
    getFirst().focus();

    rerender(<Pair first={false} second={false} />);
    expect(document.activeElement).not.toBe(getSecond());

    rerender(<Pair first={false} second />);
    expect(document.activeElement).not.toBe(getSecond());
  });

  it("ボタンの外にフォーカスがあるときは、一が無効になっても動かさない", () => {
    const { rerender } = render(<Pair first second />);
    const outside = screen.getByLabelText("外");
    outside.focus();

    rerender(<Pair first={false} second />);

    expect(document.activeElement).toBe(outside);
  });

  it("一から外へフォーカスを移した後に一が無効になっても、外のままにする", () => {
    const { rerender } = render(<Pair first second />);
    getFirst().focus();
    const outside = screen.getByLabelText("外");
    outside.focus();

    rerender(<Pair first={false} second />);

    expect(document.activeElement).toBe(outside);
  });

  it("無効になったボタンの blur では記録を残し、その後の描画で二へ移す", () => {
    const { rerender } = render(<Pair first second />);
    const first = getFirst() as HTMLButtonElement;
    first.focus();
    // 無効化して blur が届くブラウザの順序を、本物の blur で作る。ハンドラーの focusout は blur の後に届くので、
    // そこではもう無効で、フォーカスは body にある。コミット中の blur は React が流さないため rerender の前に起こす
    first.addEventListener("blur", () => {
      first.disabled = true;
    }, { once: true });
    first.blur();
    expect(first).toBeDisabled();
    expect(document.activeElement).toBe(document.body);

    rerender(<Pair first={false} second />);

    expect(document.activeElement).toBe(getSecond());
  });

  it("外へ移してからフォーカスが body に戻っても、blur で記録が消えているので二へ移さない", () => {
    const { rerender } = render(<Pair first second />);
    getFirst().focus();
    const outside = screen.getByLabelText("外");
    outside.focus();
    outside.blur();
    expect(document.activeElement).toBe(document.body);

    rerender(<Pair first={false} second />);

    expect(document.activeElement).toBe(document.body);
  });
});
