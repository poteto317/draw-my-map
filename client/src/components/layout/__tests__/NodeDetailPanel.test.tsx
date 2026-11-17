import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { NodeDetailPanel } from "@/components/layout/NodeDetailPanel";
import type { AddNodeLinkOutcome } from "@/domain/nodes/nodeLink";
import { createMapHistoryLeaseSpy, createTestMapHistoryLease } from "@/testing/createTestMapHistoryLease";

type Props = ComponentProps<typeof NodeDetailPanel>;

const APPLE_URL = "https://example.com/apple";

function renderPanel(overrides: Partial<Props> = {}) {
  const props: Props = {
    selectedNode: { id: 1, label: "りんご", note: "りんごのメモ", links: [APPLE_URL] },
    selectionCount: 1,
    documentRevision: 0,
    onPreviewNote: jest.fn(() => true),
    onBeginNoteEdit: jest.fn(() => createTestMapHistoryLease()),
    onAddLink: jest.fn((): AddNodeLinkOutcome => ({ ok: true })),
    onRemoveLink: jest.fn(() => true),
    generation: { status: "idle" },
    onGenerate: jest.fn(),
    onAttach: jest.fn(),
    onRemove: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<NodeDetailPanel {...props} />) };
}

function panel(): HTMLElement {
  return screen.getByRole("complementary", { name: "ノードの詳細" });
}

function box(): HTMLTextAreaElement {
  return screen.getByRole("textbox", { name: "詳細メモ" }) as HTMLTextAreaElement;
}

function urlInput(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "URLを追加" }) as HTMLInputElement;
}

describe("NodeDetailPanel", () => {
  it("名前付きの補足領域で、幅 w-72・縮まない・内容が高さを超えたら縦にスクロールする", () => {
    renderPanel();

    expect(panel()).toHaveClass("w-72", "shrink-0", "min-h-0", "overflow-y-auto");
  });

  it("上から詳細メモ、リンク、イラストの順に置く", () => {
    renderPanel();

    const headings = within(panel()).getAllByRole("heading").map((heading) => heading.textContent);
    expect(headings).toEqual(["詳細メモ", "リンク", "イラスト"]);
    expect(within(panel()).getByRole("region", { name: "リンク" })).toBeInTheDocument();
    expect(within(panel()).getByRole("region", { name: "イラスト" })).toBeInTheDocument();
  });

  it("イラストの機能は従来どおり（生成ボタンで選択中のノード ID を通知する）", async () => {
    const user = userEvent.setup();
    const { props } = renderPanel();

    await user.click(screen.getByRole("button", { name: "イラストを生成" }));

    expect(props.onGenerate).toHaveBeenCalledWith(1);
  });

  it("未選択のときはメモの欄を無効にし、URL の入力欄を出さず、3 つの節すべてに案内を出す", () => {
    renderPanel({ selectedNode: null, selectionCount: 0 });

    expect(box()).toBeDisabled();
    expect(screen.queryByRole("textbox", { name: "URLを追加" })).toBeNull();
    expect(within(panel()).getAllByText("ノードを選択してください")).toHaveLength(3);
  });

  it("選択中のノードのメモと URL を出し、選択件数を渡す", () => {
    renderPanel({ selectionCount: 2 });

    expect(box()).toHaveValue("りんごのメモ");
    expect(screen.getByRole("link", { name: APPLE_URL })).toHaveAttribute("href", APPLE_URL);
    expect(screen.getByText("2 件選択中。主選択のノードのメモを編集します")).toBeInTheDocument();
  });

  it("URL の追加と削除は、選択中のノードの ID で通知する", async () => {
    const user = userEvent.setup();
    const { props } = renderPanel();

    await user.type(urlInput(), "https://example.com/new{Enter}");
    await user.click(screen.getByRole("button", { name: `リンクを削除: ${APPLE_URL}` }));

    expect(props.onAddLink).toHaveBeenCalledWith(1, "https://example.com/new");
    expect(props.onRemoveLink).toHaveBeenCalledWith(1, APPLE_URL);
  });

  it("選択の ID が変わると作り直す。フォーカスを外さずに変わっても、前のノードの下書きを反映してから切り替える", () => {
    const spy = createMapHistoryLeaseSpy();
    const { props, rerender } = renderPanel({ onBeginNoteEdit: spy.onBeginNodeMove });
    act(() => box().focus());
    fireEvent.change(box(), { target: { value: "下書き" } });
    fireEvent.change(urlInput(), { target: { value: "https://example.com/draft" } });

    rerender(<NodeDetailPanel {...props} selectedNode={{ id: 2, label: "みかん" }} />);

    expect(props.onPreviewNote).toHaveBeenCalledWith(1, "下書き");
    expect(box()).toHaveValue("");
    expect(urlInput()).toHaveValue("");
    expect(screen.getByText("リンクはありません")).toBeInTheDocument();
  });

  it("documentRevision が変わると作り直し、文書の入れ替え（グループの失効）では古い下書きを書かない（L-588）", () => {
    const spy = createMapHistoryLeaseSpy();
    const { props, rerender } = renderPanel({ onBeginNoteEdit: spy.onBeginNodeMove });
    act(() => box().focus());
    fireEvent.change(box(), { target: { value: "古い下書き" } });
    spy.expire();

    rerender(<NodeDetailPanel {...props} documentRevision={1} selectedNode={{ id: 1, label: "りんご", note: "新しい文書のメモ" }} />);

    expect(props.onPreviewNote).not.toHaveBeenCalled();
    expect(box()).toHaveValue("新しい文書のメモ");
  });

  it("documentRevision が変わると、リンクの節は作り直さずに入力とエラーだけを消し、削除ボタンのフォーカスを保つ（L-588・L-155）", () => {
    const { props, rerender } = renderPanel({
      onAddLink: jest.fn((): AddNodeLinkOutcome => ({ ok: false, reason: "invalid" })),
    });
    fireEvent.change(urlInput(), { target: { value: "example.com" } });
    fireEvent.submit(urlInput().form!);
    expect(within(panel()).getByRole("alert")).toBeInTheDocument();
    const deleteButton = screen.getByRole("button", { name: `リンクを削除: ${APPLE_URL}` });
    act(() => deleteButton.focus());

    rerender(<NodeDetailPanel {...props} documentRevision={1} />);

    expect(within(panel()).queryByRole("alert")).toBeNull();
    expect(urlInput()).toHaveValue("");
    expect(screen.getByRole("button", { name: `リンクを削除: ${APPLE_URL}` })).toBe(deleteButton);
    expect(deleteButton).toHaveFocus();
  });
});
