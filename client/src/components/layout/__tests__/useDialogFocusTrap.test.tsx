import { useRef } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  listFocusableElements,
  useDialogFocusTrap,
} from "@/components/layout/useDialogFocusTrap";

type HarnessProps = {
  firstDisabled?: boolean;
  secondDisabled?: boolean;
  onEscape: () => void;
};

function TrapHarness({
  firstDisabled = false,
  secondDisabled = true,
  onEscape,
}: HarnessProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap({ dialogRef, overlayRef, onEscape });

  return (
    <div ref={overlayRef} data-testid="overlay">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="テスト">
        <button type="button" disabled={firstDisabled}>
          1つ目
        </button>
        <button type="button" disabled={secondDisabled}>
          2つ目
        </button>
        <button type="button">3つ目</button>
        <button type="button">4つ目</button>
      </div>
    </div>
  );
}

function renderTrap(props: Partial<HarnessProps> = {}) {
  const onEscape = props.onEscape ?? jest.fn();
  const result = render(
    <>
      <button type="button">外のボタン</button>
      <TrapHarness {...props} onEscape={onEscape} />
    </>,
  );
  return { ...result, onEscape };
}

// 同じ name のラジオ2つを、ボタンで挟む
function RadioTrapHarness({ checked }: { checked: "a" | "b" | null }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap({ dialogRef, overlayRef, onEscape: () => {} });

  return (
    <div ref={overlayRef}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="テスト">
        <button type="button">前</button>
        <label>
          <input type="radio" name="place" checked={checked === "a"} onChange={() => {}} />
          ラジオA
        </label>
        <label>
          <input type="radio" name="place" checked={checked === "b"} onChange={() => {}} />
          ラジオB
        </label>
        <button type="button">後</button>
      </div>
    </div>
  );
}

function radio(name: string) {
  return screen.getByRole("radio", { name });
}

function button(name: string) {
  return screen.getByRole("button", { name });
}

describe("useDialogFocusTrap", () => {
  it("最後から Tab で最初へ、最初から Shift+Tab で最後へ循環し、disabled を飛ばす", async () => {
    const user = userEvent.setup();
    renderTrap();

    button("1つ目").focus();
    await user.tab();
    await waitFor(() => expect(button("3つ目")).toHaveFocus());

    await user.tab();
    await waitFor(() => expect(button("4つ目")).toHaveFocus());

    await user.tab();
    await waitFor(() => expect(button("1つ目")).toHaveFocus());

    await user.tab({ shift: true });
    await waitFor(() => expect(button("4つ目")).toHaveFocus());
  });

  it("表示中に1つ目が disabled になると、次の Tab で数え直す", async () => {
    const user = userEvent.setup();
    const onEscape = jest.fn();
    const { rerender } = render(
      <>
        <button type="button">外のボタン</button>
        <TrapHarness onEscape={onEscape} />
      </>,
    );

    // 4つ目から Tab で循環する先が、数え直した一覧の先頭（3つ目）になる。
    // 開いたときの一覧を使い続けると、disabled の1つ目へ focus() して無視され、4つ目に残る
    button("4つ目").focus();
    rerender(
      <>
        <button type="button">外のボタン</button>
        <TrapHarness firstDisabled onEscape={onEscape} />
      </>,
    );

    await user.tab();
    await waitFor(() => expect(button("3つ目")).toHaveFocus());
    expect(button("外のボタン")).not.toHaveFocus();
  });

  it("表示中に2つ目が有効になると、次の Tab で2つ目へ移る", async () => {
    const user = userEvent.setup();
    const onEscape = jest.fn();
    const { rerender } = render(<TrapHarness onEscape={onEscape} />);

    button("1つ目").focus();
    rerender(<TrapHarness secondDisabled={false} onEscape={onEscape} />);

    await user.tab();
    await waitFor(() => expect(button("2つ目")).toHaveFocus());
  });

  it("外のボタンへ focus() すると、ダイアログの中で最後にフォーカスがあった要素へ戻す", async () => {
    renderTrap();

    button("3つ目").focus();
    button("外のボタン").focus();

    await waitFor(() => expect(button("3つ目")).toHaveFocus());
  });

  it("中にフォーカスが無いまま外へ移ると、最初のフォーカス可能な要素へ戻す", async () => {
    renderTrap();

    button("外のボタン").focus();

    await waitFor(() => expect(button("1つ目")).toHaveFocus());
  });

  it("オーバーレイの pointerdown を preventDefault し、フォーカスを中に残す（閉じない）", async () => {
    const { onEscape } = renderTrap();
    button("3つ目").focus();

    const notPrevented = fireEvent.pointerDown(screen.getByTestId("overlay"));

    expect(notPrevented).toBe(false);
    await waitFor(() => expect(button("3つ目")).toHaveFocus());
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("オーバーレイの mousedown も preventDefault し、フォーカスを中に残す（閉じない）", async () => {
    const { onEscape } = renderTrap();
    button("3つ目").focus();

    const notPrevented = fireEvent.mouseDown(screen.getByTestId("overlay"));

    expect(notPrevented).toBe(false);
    await waitFor(() => expect(button("3つ目")).toHaveFocus());
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("ダイアログの中の mousedown は妨げない", () => {
    renderTrap();

    expect(fireEvent.mouseDown(button("3つ目"))).toBe(true);
  });

  it("ダイアログの中の pointerdown は妨げない", () => {
    renderTrap();

    const notPrevented = fireEvent.pointerDown(button("3つ目"));

    expect(notPrevented).toBe(true);
  });

  it("Escape で onEscape を呼び、IME の変換中の Escape では呼ばない", () => {
    const { onEscape } = renderTrap();

    fireEvent.keyDown(window, { key: "Escape", isComposing: true });
    fireEvent.keyDown(window, { key: "Escape", keyCode: 229 });
    expect(onEscape).not.toHaveBeenCalled();

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("押し続けの Escape（repeat）では onEscape を呼ばない", () => {
    const { onEscape } = renderTrap();

    fireEvent.keyDown(window, { key: "Escape", repeat: true });
    expect(onEscape).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("Escape は capture で受けるため、途中で伝播が止められても onEscape を呼ぶ", () => {
    const { onEscape } = renderTrap();
    const stop = (event: Event) => event.stopPropagation();
    document.body.addEventListener("keydown", stop);

    try {
      fireEvent.keyDown(button("3つ目"), { key: "Escape" });
    } finally {
      document.body.removeEventListener("keydown", stop);
    }

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("中にフォーカスが無いとき（body）は、Tab で最初へ、Shift+Tab で最後へ移す", () => {
    renderTrap();
    expect(document.body).toHaveFocus();

    expect(fireEvent.keyDown(window, { key: "Tab" })).toBe(false);
    expect(button("1つ目")).toHaveFocus();

    (document.activeElement as HTMLElement).blur();
    expect(document.body).toHaveFocus();
    expect(fireEvent.keyDown(window, { key: "Tab", shiftKey: true })).toBe(false);
    expect(button("4つ目")).toHaveFocus();
  });

  it.each(["altKey", "ctrlKey", "metaKey"] as const)(
    "%s 付きの Tab は止めず、フォーカスも動かさない",
    (modifier) => {
      renderTrap();
      button("3つ目").focus();

      expect(fireEvent.keyDown(window, { key: "Tab", [modifier]: true })).toBe(true);
      expect(button("3つ目")).toHaveFocus();
    },
  );

  it("フォーカス可能な要素が中に無いときも、Tab の既定動作を止めて外へ出さない", () => {
    function EmptyTrapHarness() {
      const dialogRef = useRef<HTMLDivElement>(null);
      const overlayRef = useRef<HTMLDivElement>(null);
      useDialogFocusTrap({ dialogRef, overlayRef, onEscape: () => {} });
      return (
        <div ref={overlayRef}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="空">
            <p>本文だけ</p>
          </div>
        </div>
      );
    }
    render(<EmptyTrapHarness />);

    expect(fireEvent.keyDown(window, { key: "Tab" })).toBe(false);
    expect(document.body).toHaveFocus();
  });

  it("アンマウント後は、外へのフォーカスを戻さず Escape も受けない", () => {
    const onEscape = jest.fn();
    const { rerender } = render(
      <>
        <button type="button">外のボタン</button>
        <TrapHarness onEscape={onEscape} />
      </>,
    );
    button("3つ目").focus();

    rerender(<button type="button">外のボタン</button>);
    button("外のボタン").focus();
    fireEvent.keyDown(window, { key: "Escape" });

    // 戻されないことの否定の確認なので、待たずに確かめる
    expect(button("外のボタン")).toHaveFocus();
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("同じ name のラジオは、選ばれている1つにだけ Tab・Shift+Tab で止まる", async () => {
    const user = userEvent.setup();
    render(<RadioTrapHarness checked="b" />);

    button("前").focus();
    await user.tab();
    expect(radio("ラジオB")).toHaveFocus();
    await user.tab();
    expect(button("後")).toHaveFocus();

    await user.tab({ shift: true });
    expect(radio("ラジオB")).toHaveFocus();
    await user.tab({ shift: true });
    expect(button("前")).toHaveFocus();
  });

  it("同じ name のラジオがどれも選ばれていなければ、Tab・Shift+Tab のどちらでも先頭のラジオにだけ止まる", async () => {
    const user = userEvent.setup();
    render(<RadioTrapHarness checked={null} />);

    button("前").focus();
    await user.tab();
    expect(radio("ラジオA")).toHaveFocus();
    await user.tab();
    expect(button("後")).toHaveFocus();

    await user.tab({ shift: true });
    expect(radio("ラジオA")).toHaveFocus();
  });

  it("listFocusableElements は type=hidden の input を含めない", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<input type="hidden" value="x"><input type="text" aria-label="名前"><button type="button">確定</button>';

    const elements = listFocusableElements(container);

    expect(elements.map((element) => element.outerHTML)).toEqual([
      '<input type="text" aria-label="名前">',
      '<button type="button">確定</button>',
    ]);
  });
});
