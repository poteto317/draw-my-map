import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
  ShareCommentComposer,
  type ShareCommentComposerProps,
} from "@/components/share/ShareCommentComposer";
import { SHARE_COMMENT_BODY_MAX_LENGTH } from "@/domain/share/shareCommentLimits";
import { SHARE_COMMENT_MESSAGES } from "@/domain/share/shareCommentMessages";
import type { ShareResult } from "@/domain/share/shareResult";

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function createProps(overrides: Partial<ShareCommentComposerProps> = {}): ShareCommentComposerProps {
  return {
    value: "",
    onChange: jest.fn(),
    onSubmit: jest.fn(async () => ({ ok: true, value: null }) as ShareResult<unknown>),
    submitLabel: SHARE_COMMENT_MESSAGES.submit,
    disabled: false,
    ariaLabel: "コメントを入力",
    ...overrides,
  };
}

/** 制御コンポーネントを実際の値で動かすための外側 */
function ControlledComposer({
  initialValue = "",
  onSubmit,
  onChangeSpy,
}: {
  initialValue?: string;
  onSubmit: ShareCommentComposerProps["onSubmit"];
  onChangeSpy?: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <ShareCommentComposer
      value={value}
      onChange={(next) => {
        onChangeSpy?.(next);
        setValue(next);
      }}
      onSubmit={onSubmit}
      submitLabel={SHARE_COMMENT_MESSAGES.submit}
      disabled={false}
      ariaLabel="コメントを入力"
    />
  );
}

function submitButton() {
  return screen.getByRole("button", { name: SHARE_COMMENT_MESSAGES.submit });
}

describe("ShareCommentComposer", () => {
  it("残り文字数を正規化後の長さで表示し、入力に応じて減る", async () => {
    const user = userEvent.setup();
    render(<ControlledComposer onSubmit={jest.fn()} />);
    expect(screen.getByText(`${SHARE_COMMENT_MESSAGES.remaining} ${SHARE_COMMENT_BODY_MAX_LENGTH}`)).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "コメントを入力" }), "  abc  ");
    // 前後の空白は数えない
    expect(screen.getByText(`${SHARE_COMMENT_MESSAGES.remaining} ${SHARE_COMMENT_BODY_MAX_LENGTH - 3}`)).toBeInTheDocument();
  });

  it("空白だけ（empty）のとき送信ボタンは無効", () => {
    render(<ShareCommentComposer {...createProps({ value: "   \n  " })} />);
    expect(submitButton()).toBeDisabled();
  });

  it("2,001 文字のとき送信ボタンは無効で、2,000 文字なら有効", () => {
    const { rerender } = render(
      <ShareCommentComposer {...createProps({ value: "a".repeat(SHARE_COMMENT_BODY_MAX_LENGTH + 1) })} />,
    );
    expect(submitButton()).toBeDisabled();
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    rerender(<ShareCommentComposer {...createProps({ value: "a".repeat(SHARE_COMMENT_BODY_MAX_LENGTH) })} />);
    expect(submitButton()).toBeEnabled();
    expect(screen.getByText(`${SHARE_COMMENT_MESSAGES.remaining} 0`)).toBeInTheDocument();
  });

  it("textarea に maxLength 属性を付けない", () => {
    render(<ShareCommentComposer {...createProps()} />);
    expect(screen.getByRole("textbox")).not.toHaveAttribute("maxLength");
    expect(screen.getByRole("textbox")).not.toHaveAttribute("maxlength");
  });

  it("disabled のとき入力欄と送信ボタンは無効", () => {
    render(<ShareCommentComposer {...createProps({ value: "本文", disabled: true })} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(submitButton()).toBeDisabled();
  });

  it("送信ボタンで正規化後の本文を onSubmit に渡す", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn(async () => ({ ok: true, value: null }) as ShareResult<unknown>);
    render(<ShareCommentComposer {...createProps({ value: "  本文\r\n2 行目  ", onSubmit })} />);
    await user.click(submitButton());
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("本文\n2 行目");
    await waitFor(() => expect(submitButton()).toBeEnabled());
  });

  it("Ctrl+Enter と Cmd+Enter で送信する", async () => {
    const onSubmit = jest.fn(async () => ({ ok: true, value: null }) as ShareResult<unknown>);
    render(<ShareCommentComposer {...createProps({ value: "本文", onSubmit })} />);
    const textbox = screen.getByRole("textbox");
    await act(async () => {
      fireEvent.keyDown(textbox, { key: "Enter", ctrlKey: true });
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.keyDown(textbox, { key: "Enter", metaKey: true });
    });
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("Enter 単独では送信しない（改行になる）", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn(async () => ({ ok: true, value: null }) as ShareResult<unknown>);
    const onChangeSpy = jest.fn();
    render(<ControlledComposer initialValue="本文" onSubmit={onSubmit} onChangeSpy={onChangeSpy} />);
    const textbox = screen.getByRole("textbox");
    await user.click(textbox);
    await user.keyboard("{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onChangeSpy).toHaveBeenLastCalledWith("本文\n");
  });

  it("IME 変換中（isComposing）の Ctrl+Enter では送信しない", async () => {
    const onSubmit = jest.fn(async () => ({ ok: true, value: null }) as ShareResult<unknown>);
    render(<ShareCommentComposer {...createProps({ value: "本文", onSubmit })} />);
    await act(async () => {
      fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", ctrlKey: true, isComposing: true });
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("IME 変換中（keyCode 229）の Cmd+Enter では送信しない", async () => {
    const onSubmit = jest.fn(async () => ({ ok: true, value: null }) as ShareResult<unknown>);
    render(<ShareCommentComposer {...createProps({ value: "本文", onSubmit })} />);
    await act(async () => {
      fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", metaKey: true, keyCode: 229 });
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("送信中の連打と Ctrl+Enter の連続でも onSubmit は 1 回で、送信中はボタンが無効", async () => {
    const pending = deferred<ShareResult<unknown>>();
    const onSubmit = jest.fn(() => pending.promise);
    render(<ShareCommentComposer {...createProps({ value: "本文", onSubmit })} />);
    const textbox = screen.getByRole("textbox");
    act(() => {
      fireEvent.click(submitButton());
      fireEvent.click(submitButton());
      fireEvent.keyDown(textbox, { key: "Enter", ctrlKey: true });
      fireEvent.keyDown(textbox, { key: "Enter", metaKey: true });
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(submitButton()).toBeDisabled();
    await act(async () => {
      pending.resolve({ ok: true, value: null });
    });
    expect(submitButton()).toBeEnabled();
    await act(async () => {
      fireEvent.click(submitButton());
    });
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("送信中は textarea を readOnly にし、失敗したら textarea へフォーカスを戻す", async () => {
    const pending = deferred<ShareResult<unknown>>();
    render(<ShareCommentComposer {...createProps({ value: "本文", onSubmit: () => pending.promise })} />);
    const textbox = screen.getByRole("textbox");
    expect(textbox).not.toHaveAttribute("readonly");
    act(() => {
      fireEvent.click(submitButton());
    });
    expect(textbox).toHaveAttribute("readonly");
    await act(async () => {
      pending.resolve({ ok: false, reason: "rate-limited" });
    });
    expect(textbox).not.toHaveAttribute("readonly");
    expect(textbox).toHaveFocus();
  });

  it("成功したときはフォーカスを textarea へ移さない", async () => {
    const user = userEvent.setup();
    render(<ShareCommentComposer {...createProps({ value: "本文" })} />);
    await user.click(submitButton());
    await waitFor(() => expect(submitButton()).toBeEnabled());
    expect(screen.getByRole("textbox")).not.toHaveFocus();
  });

  it("失敗しても入力を残す（onChange('') を呼ばない）", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const onSubmit = jest.fn(async () => ({ ok: false, reason: "rate-limited" }) as ShareResult<unknown>);
    render(<ShareCommentComposer {...createProps({ value: "本文", onChange, onSubmit })} />);
    await user.click(submitButton());
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("本文");
    expect(submitButton()).toBeEnabled();
  });
});
