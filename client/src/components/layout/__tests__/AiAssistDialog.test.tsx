import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { AiAssistDialog } from "@/components/layout/AiAssistDialog";
import type { AiAssistDialogBody, AiAssistDialogView } from "@/hooks/aiAssistDialogView";
import { STALE_DIALOG_MESSAGE } from "@/hooks/dialogPreviewText";

type Props = ComponentProps<typeof AiAssistDialog>;

const CONFIRM: AiAssistDialogBody = {
  screen: "confirm",
  confirm: {
    providerLabel: "Anthropic（Claude API）", model: "claude-opus-5-5", rootLabel: "根",
    descendantCount: 2, totalLength: 1234, truncatedCount: 1, excludedLockedCount: null, blockedReason: null,
  },
};

function view(body: AiAssistDialogBody, overrides: Partial<AiAssistDialogView> = {}): AiAssistDialogView {
  return { kind: "branch-summary", title: "枝を要約してメモに入れる", stale: false, statusText: "状態", body, ...overrides };
}

function renderDialog(v: AiAssistDialogView) {
  const props: Props = {
    view: v,
    onClose: jest.fn(), onSend: jest.fn(), onRetry: jest.fn(), onDecide: jest.fn(),
    onNoteModeChange: jest.fn(), onApply: jest.fn(), onMouseClick: jest.fn(),
  };
  const utils = render(<AiAssistDialog {...props} />);
  return { props, ...utils };
}

function dialog() {
  return screen.getByRole("dialog", { name: "枝を要約してメモに入れる" });
}

describe("AiAssistDialog", () => {
  it("名前と説明つきのモーダルで、開いたら見出しへフォーカスし、状態文を aria-live で出す", () => {
    renderDialog(view({ screen: "checking" }, { statusText: "確認しています…" }));
    expect(dialog()).toHaveAttribute("aria-modal", "true");
    expect(dialog()).toHaveAccessibleDescription(/採用・却下を選んでから適用します/);
    expect(screen.getByRole("heading", { name: "枝を要約してメモに入れる" })).toHaveFocus();
    expect(screen.getByText("確認しています…")).toHaveAttribute("aria-live", "polite");
    expect(dialog().querySelector("form")).toBeNull();
  });

  it("確認画面に送信先・送るもの・送らないものを出し、送信ボタンで送る", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog(view(CONFIRM));

    expect(screen.getByText("Anthropic（Claude API）（claude-opus-5-5）")).toBeInTheDocument();
    expect(screen.getByText(/選んだノード「根」と子孫 2 件のラベルとメモ（ラベルは各 200 文字、メモは各 500 文字まで。1 件は先頭だけ）、合計 1,234 文字/)).toBeInTheDocument();
    expect(screen.getByText("イラスト・URL・タグ・出典・他のマップ")).toBeInTheDocument();
    const send = screen.getByRole("button", { name: "送信して提案を作る" });
    expect(send).toHaveAttribute("type", "button");
    await user.click(send);
    expect(props.onSend).toHaveBeenCalledTimes(1);
  });

  it("送れない理由があれば送信ボタンを無効にし、理由を説明に結び付ける", () => {
    renderDialog(view({ screen: "confirm", confirm: { ...CONFIRM.confirm, blockedReason: "枝が大きすぎます" } }));
    const send = screen.getByRole("button", { name: "送信して提案を作る" });
    expect(send).toBeDisabled();
    expect(send).toHaveAccessibleDescription("枝が大きすぎます");
  });

  it("送れないときは「送るもの」「対象外」を出さず、送信先・送らないもの・理由だけにする", () => {
    renderDialog(view({
      screen: "confirm",
      confirm: { ...CONFIRM.confirm, rootLabel: "（空）", descendantCount: 0, totalLength: 0, truncatedCount: 0, excludedLockedCount: 3, blockedReason: "枝が大きすぎます" },
    }, { kind: "importance", title: "枝を要約してメモに入れる" }));
    expect(screen.getByText("Anthropic（Claude API）（claude-opus-5-5）")).toBeInTheDocument();
    expect(screen.getByText("イラスト・URL・タグ・出典・他のマップ")).toBeInTheDocument();
    expect(screen.getByText("枝が大きすぎます")).toBeInTheDocument();
    expect(screen.queryByText("送るもの")).not.toBeInTheDocument();
    expect(screen.queryByText(/子孫 0 件/)).not.toBeInTheDocument();
    expect(screen.queryByText("対象外")).not.toBeInTheDocument();
  });

  it("要約の確認画面では選んだノード自身のメモを送らないと示し、重要度では対象外のロック中ノードを示す", () => {
    const { unmount } = renderDialog(view(CONFIRM));
    expect(screen.getByText(/選んだノード自身のメモは送りません/)).toBeInTheDocument();
    expect(screen.queryByText("対象外")).not.toBeInTheDocument();
    unmount();

    renderDialog(view({ screen: "confirm", confirm: { ...CONFIRM.confirm, excludedLockedCount: 3 } }, { kind: "importance" }));
    expect(screen.getByText("対象外")).toBeInTheDocument();
    expect(screen.getByText(/ロック中のノード 3 件/)).toBeInTheDocument();
    expect(screen.queryByText(/選んだノード自身のメモは送りません/)).not.toBeInTheDocument();
  });

  it("使えない画面は案内文と「閉じる」だけを出す", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog(view({ screen: "unavailable", message: "AI 支援が設定されていません。" }));
    expect(screen.getByText("AI 支援が設定されていません。")).toBeInTheDocument();
    expect(within(dialog()).getAllByRole("button").map((button) => button.textContent)).toEqual(["閉じる"]);
    await user.click(screen.getByRole("button", { name: "閉じる" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("提案なしの件数を示す", () => {
    renderDialog(view({
      screen: "review",
      proposals: [{ kind: "importance", key: "importance:2", nodeLabel: "子A", decision: "undecided", stale: false, currentLabel: "中", proposedLabel: "高", reason: "" }],
      unchangedCount: 0, missingCount: 2, acceptedCount: 0, canApply: false, proposalsStale: false, applyError: null,
    }));
    expect(screen.getByText("提案なし 2 件")).toBeInTheDocument();
  });

  it("生成中は取り消しだけを出す", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog(view({ screen: "generating" }));
    await user.click(screen.getByRole("button", { name: "取り消し" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "送信して提案を作る" })).not.toBeInTheDocument();
  });

  it("失敗は role=alert で示し、もう一度と閉じるを出す", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog(view({ screen: "failed", message: "通信に失敗しました。" }));
    expect(screen.getByRole("alert")).toHaveTextContent("通信に失敗しました。");
    await user.click(screen.getByRole("button", { name: "もう一度" }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });

  it("採用 0 件では適用ボタンを押せず、採用 1 件で押せる（L-687）", () => {
    const review = (acceptedCount: number): AiAssistDialogBody => ({
      screen: "review",
      proposals: [{ kind: "importance", key: "importance:2", nodeLabel: "子A", decision: acceptedCount > 0 ? "accepted" : "undecided", stale: false, currentLabel: "中", proposedLabel: "高", reason: "" }],
      unchangedCount: 1, missingCount: 0, acceptedCount, canApply: acceptedCount > 0, proposalsStale: false, applyError: null,
    });
    const { rerender, props } = renderDialog(view(review(0)));
    expect(screen.getByRole("button", { name: "採用した 0 件を適用" })).toBeDisabled();
    expect(screen.getByText("変更なし 1 件")).toBeInTheDocument();

    rerender(<AiAssistDialog {...props} view={view(review(1))} />);
    expect(screen.getByRole("button", { name: "採用した 1 件を適用" })).toBeEnabled();
  });

  it("提案が古くなったら、作り直しを促す alert と「もう一度提案を作る」だけを出す", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog(view({
      screen: "review",
      proposals: [{ kind: "importance", key: "importance:2", nodeLabel: "子A", decision: "accepted", stale: true, currentLabel: "中", proposedLabel: "高", reason: "" }],
      unchangedCount: 0, missingCount: 0, acceptedCount: 1, canApply: false, proposalsStale: true, applyError: null,
    }));

    expect(screen.getByRole("alert")).toHaveTextContent("提案を作った後にマップが変わったため、適用しませんでした。もう一度提案を作ってください。");
    expect(screen.queryByRole("button", { name: /件を適用/ })).not.toBeInTheDocument();
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "もう一度提案を作る" }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });

  it("開いた後にマップが更新されたら、どの画面でも閉じるだけにする", () => {
    renderDialog(view(CONFIRM, { stale: true, statusText: STALE_DIALOG_MESSAGE }));
    expect(screen.queryByRole("button", { name: "送信して提案を作る" })).not.toBeInTheDocument();
    expect(within(dialog()).getAllByRole("button").map((button) => button.textContent)).toEqual(["閉じる"]);
  });

  it("開いた後にマップが更新された文言は状態文の 1 か所だけに出し、alert と重ねて読み上げない", () => {
    renderDialog(view(CONFIRM, { stale: true, statusText: STALE_DIALOG_MESSAGE }));
    expect(screen.getAllByText(STALE_DIALOG_MESSAGE)).toHaveLength(1);
    expect(screen.getByText(STALE_DIALOG_MESSAGE)).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("alert")).toHaveTextContent("");
  });

  it("画面が替わったら見出しへフォーカスを移す（取り消しにあったフォーカスが適用に届かない。L-408）", () => {
    const reviewBody = (proposalsStale: boolean): AiAssistDialogBody => ({
      screen: "review",
      proposals: [{ kind: "importance", key: "importance:2", nodeLabel: "子A", decision: "accepted", stale: proposalsStale, currentLabel: "中", proposedLabel: "高", reason: "" }],
      unchangedCount: 0, missingCount: 0, acceptedCount: 1, canApply: !proposalsStale, proposalsStale, applyError: null,
    });
    const { rerender, props } = renderDialog(view({ screen: "generating" }));
    const heading = screen.getByRole("heading", { name: "枝を要約してメモに入れる" });

    screen.getByRole("button", { name: "取り消し" }).focus();
    rerender(<AiAssistDialog {...props} view={view(reviewBody(false))} />);
    expect(heading).toHaveFocus();

    screen.getByRole("button", { name: "採用した 1 件を適用" }).focus();
    rerender(<AiAssistDialog {...props} view={view(reviewBody(true))} />);
    expect(heading).toHaveFocus();
  });

  it("Escape で閉じる", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog(view(CONFIRM));
    await user.keyboard("{Escape}");
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
