import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiProposalReviewList } from "@/components/layout/AiProposalReviewList";
import type { AiProposalView } from "@/hooks/aiAssistDialogView";

function noteView(overrides: Partial<Extract<AiProposalView, { kind: "note" }>> = {}): AiProposalView {
  return {
    kind: "note", key: "note:1", nodeLabel: "根", decision: "undecided", stale: false,
    currentNote: "前のメモ", mode: "append", canAppend: true, appendBlockedText: null,
    previewNote: "前のメモ\n\n要約", error: null, ...overrides,
  };
}

function importanceView(overrides: Partial<Extract<AiProposalView, { kind: "importance" }>> = {}): AiProposalView {
  return {
    kind: "importance", key: "importance:2", nodeLabel: "子A", decision: "undecided", stale: false,
    currentLabel: "中", proposedLabel: "高", reason: "主要な論点", ...overrides,
  };
}

function renderList(proposals: AiProposalView[], disabled = false) {
  const onDecide = jest.fn();
  const onNoteModeChange = jest.fn();
  render(<AiProposalReviewList proposals={proposals} disabled={disabled} onDecide={onDecide} onNoteModeChange={onNoteModeChange} />);
  return { onDecide, onNoteModeChange };
}

describe("AiProposalReviewList", () => {
  it("名前付きの一覧に、対象・現在の値と適用後・採否の radiogroup を出し、既定はどちらも未選択（未決）", () => {
    renderList([noteView(), importanceView()]);

    const list = screen.getByRole("list", { name: "AIの提案" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("前のメモ")).toBeInTheDocument();
    expect(within(items[0]).getByText(/前のメモ\s+要約/)).toBeInTheDocument();
    expect(within(items[1]).getByText("中 → 高")).toBeInTheDocument();
    expect(within(items[1]).getByText(/主要な論点/)).toBeInTheDocument();
    const group = within(items[1]).getByRole("radiogroup", { name: "「子A」の採否" });
    expect(within(group).getByRole("radio", { name: "採用" })).not.toBeChecked();
    expect(within(group).getByRole("radio", { name: "却下" })).not.toBeChecked();
  });

  it("採用・却下・適用方法の選択を通知する", async () => {
    const user = userEvent.setup();
    const { onDecide, onNoteModeChange } = renderList([noteView()]);

    await user.click(screen.getByRole("radio", { name: "採用" }));
    await user.click(screen.getByRole("radio", { name: "置き換え" }));

    expect(onDecide).toHaveBeenCalledWith("note:1", "accepted");
    expect(onNoteModeChange).toHaveBeenCalledWith("note:1", "replace");
  });

  it("メモが無ければ適用方法を出さず「（メモなし）」と示す", () => {
    renderList([noteView({ currentNote: null, mode: "replace", canAppend: false, previewNote: "要約" })]);
    expect(screen.getByText("（メモなし）")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "末尾に追記" })).not.toBeInTheDocument();
  });

  it("追記で上限を超えるときは「末尾に追記」を無効にして理由を示し、適用方法が未選択の間は「採用」を押せない（L-057）", () => {
    renderList([noteView({ mode: null, canAppend: false, appendBlockedText: "追記すると 10,000 文字を超えます（10,004 文字）" })]);

    const append = screen.getByRole("radio", { name: "末尾に追記" });
    expect(append).toBeDisabled();
    expect(append).toHaveAccessibleDescription("追記すると 10,000 文字を超えます（10,004 文字）");
    expect(screen.getByRole("radio", { name: "採用" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "採用" })).toHaveAccessibleDescription("（適用方法を選んでください）");
    expect(screen.getByRole("radio", { name: "却下" })).toBeEnabled();
  });

  it("適用方法を選んだ後や disabled のときは「採用」に未選択の理由を結び付けない", () => {
    const { unmount } = render(
      <AiProposalReviewList proposals={[noteView()]} disabled={false} onDecide={jest.fn()} onNoteModeChange={jest.fn()} />,
    );
    expect(screen.getByRole("radio", { name: "採用" })).not.toHaveAttribute("aria-describedby");
    unmount();
    renderList([noteView({ mode: null })], true);
    expect(screen.getByRole("radio", { name: "採用" })).not.toHaveAttribute("aria-describedby");
  });

  it("disabled のときはメモの適用方法の fieldset も無効にする", () => {
    renderList([noteView()], true);
    expect(screen.getByRole("group", { name: "適用方法" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "置き換え" })).toBeDisabled();
  });

  it("古い提案に印を付け、disabled ならすべての選択を無効にする", () => {
    renderList([importanceView({ stale: true })], true);
    expect(screen.getByText("提案を作った後に変わりました")).toBeInTheDocument();
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
  });
});
