import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { NodeDetailPanel } from "@/components/layout/NodeDetailPanel";
import type { AddNodeLinkOutcome } from "@/domain/nodes/nodeLink";
import type { AddNodeSourceOutcome } from "@/domain/nodes/nodeSource";
import type { AddNodeTagOutcome } from "@/domain/nodes/nodeTag";
import { createMapHistoryLeaseSpy, createTestMapHistoryLease } from "@/testing/createTestMapHistoryLease";

type Props = ComponentProps<typeof NodeDetailPanel>;

const APPLE_URL = "https://example.com/apple";
const SOURCE_URL = "https://example.com/book";

function renderPanel(overrides: Partial<Props> = {}) {
  const props: Props = {
    selectedNode: {
      id: 1,
      label: "りんご",
      note: "りんごのメモ",
      tags: ["果物"],
      links: [APPLE_URL],
      sources: [{ title: "設計入門", page: "12", url: SOURCE_URL }],
    },
    selectionCount: 1,
    documentRevision: 0,
    onPreviewNote: jest.fn(() => true),
    onBeginNoteEdit: jest.fn(() => createTestMapHistoryLease()),
    onAddTag: jest.fn((): AddNodeTagOutcome => ({ ok: true })),
    onRemoveTag: jest.fn(() => true),
    onAddLink: jest.fn((): AddNodeLinkOutcome => ({ ok: true })),
    onRemoveLink: jest.fn(() => true),
    onAddSource: jest.fn((): AddNodeSourceOutcome => ({ ok: true })),
    onRemoveSource: jest.fn(() => true),
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

function tagInput(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "タグを追加" }) as HTMLInputElement;
}

function urlInput(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "URLを追加" }) as HTMLInputElement;
}

function sourceTitleInput(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "タイトル" }) as HTMLInputElement;
}

function sourcePageInput(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "ページ" }) as HTMLInputElement;
}

function sourceUrlInput(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "URL" }) as HTMLInputElement;
}

describe("NodeDetailPanel", () => {
  it("名前付きの補足領域で、幅 w-72・縮まない・内容が高さを超えたら縦にスクロールする", () => {
    renderPanel();

    expect(panel()).toHaveClass("w-72", "shrink-0", "min-h-0", "overflow-y-auto");
  });

  it("上から詳細メモ、タグ、リンク、出典、イラストの順に置く", () => {
    renderPanel();

    const headings = within(panel()).getAllByRole("heading").map((heading) => heading.textContent);
    expect(headings).toEqual(["詳細メモ", "タグ", "リンク", "出典", "イラスト"]);
    expect(within(panel()).getByRole("region", { name: "タグ" })).toBeInTheDocument();
    expect(within(panel()).getByRole("region", { name: "リンク" })).toBeInTheDocument();
    expect(within(panel()).getByRole("region", { name: "出典" })).toBeInTheDocument();
    expect(within(panel()).getByRole("region", { name: "イラスト" })).toBeInTheDocument();
  });

  it("イラストの機能は従来どおり（生成ボタンで選択中のノード ID を通知する）", async () => {
    const user = userEvent.setup();
    const { props } = renderPanel();

    await user.click(screen.getByRole("button", { name: "イラストを生成" }));

    expect(props.onGenerate).toHaveBeenCalledWith(1);
  });

  it("未選択のときはメモの欄を無効にし、タグ・URL・出典の入力欄を出さず、5 つの節すべてに案内を出す", () => {
    renderPanel({ selectedNode: null, selectionCount: 0 });

    expect(box()).toBeDisabled();
    expect(screen.queryByRole("textbox", { name: "タグを追加" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "URLを追加" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "タイトル" })).toBeNull();
    expect(within(panel()).getAllByText("ノードを選択してください")).toHaveLength(5);
  });

  it("選択中のノードのメモ・タグ・URL・出典を出し、選択件数を渡す", () => {
    renderPanel({ selectionCount: 2 });

    expect(box()).toHaveValue("りんごのメモ");
    expect(screen.getByRole("button", { name: "タグを削除: 果物" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: APPLE_URL })).toHaveAttribute("href", APPLE_URL);
    expect(screen.getByText("設計入門")).toBeInTheDocument();
    expect(screen.getByText("p. 12")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: SOURCE_URL })).toHaveAttribute("href", SOURCE_URL);
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

  it("タグの追加と削除は、選択中のノードの ID で通知し、リンク・出典の通知とは混ざらない", async () => {
    const user = userEvent.setup();
    const { props } = renderPanel();

    await user.type(tagInput(), "重要{Enter}");
    await user.click(screen.getByRole("button", { name: "タグを削除: 果物" }));

    expect(props.onAddTag).toHaveBeenCalledWith(1, "重要");
    expect(props.onRemoveTag).toHaveBeenCalledWith(1, "果物");
    expect(props.onAddLink).not.toHaveBeenCalled();
    expect(props.onRemoveLink).not.toHaveBeenCalled();
    expect(props.onAddSource).not.toHaveBeenCalled();
    expect(props.onRemoveSource).not.toHaveBeenCalled();
  });

  it("出典の追加と削除は、選択中のノードの ID で通知し、リンク・タグの通知とは混ざらない", async () => {
    const user = userEvent.setup();
    const { props } = renderPanel();

    await user.type(sourceTitleInput(), "実装ガイド");
    await user.type(sourcePageInput(), "3");
    await user.type(sourceUrlInput(), "https://example.com/guide{Enter}");
    await user.click(screen.getByRole("button", { name: `出典を削除: 設計入門 p. 12 ${SOURCE_URL}` }));

    expect(props.onAddSource).toHaveBeenCalledWith(1, {
      title: "実装ガイド",
      page: "3",
      url: "https://example.com/guide",
    });
    expect(props.onRemoveSource).toHaveBeenCalledWith(1, 0);
    expect(props.onAddLink).not.toHaveBeenCalled();
    expect(props.onRemoveLink).not.toHaveBeenCalled();
    expect(props.onAddTag).not.toHaveBeenCalled();
    expect(props.onRemoveTag).not.toHaveBeenCalled();
  });

  it("選択の ID が変わると作り直す。フォーカスを外さずに変わっても、前のノードの下書きを反映してから切り替える", () => {
    const spy = createMapHistoryLeaseSpy();
    const { props, rerender } = renderPanel({ onBeginNoteEdit: spy.onBeginNodeMove });
    act(() => box().focus());
    fireEvent.change(box(), { target: { value: "下書き" } });
    fireEvent.change(urlInput(), { target: { value: "https://example.com/draft" } });
    fireEvent.change(tagInput(), { target: { value: "下書きのタグ" } });
    fireEvent.change(sourceTitleInput(), { target: { value: "下書きの出典" } });

    rerender(<NodeDetailPanel {...props} selectedNode={{ id: 2, label: "みかん" }} />);

    expect(props.onPreviewNote).toHaveBeenCalledWith(1, "下書き");
    expect(box()).toHaveValue("");
    expect(urlInput()).toHaveValue("");
    expect(screen.getByText("リンクはありません")).toBeInTheDocument();
    expect(tagInput()).toHaveValue("");
    expect(screen.getByText("タグはありません")).toBeInTheDocument();
    expect(sourceTitleInput()).toHaveValue("");
    expect(screen.getByText("出典はありません")).toBeInTheDocument();
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

  it("documentRevision が変わると、タグの節は作り直さずに入力とエラーだけを消し、削除ボタンのフォーカスを保つ（L-588・L-155）", () => {
    const { props, rerender } = renderPanel({
      onAddTag: jest.fn((): AddNodeTagOutcome => ({ ok: false, reason: "duplicate" })),
    });
    fireEvent.change(tagInput(), { target: { value: "果物" } });
    fireEvent.submit(tagInput().form!);
    expect(within(panel()).getByRole("alert")).toHaveTextContent("同じタグがすでに追加されています。");
    const deleteButton = screen.getByRole("button", { name: "タグを削除: 果物" });
    act(() => deleteButton.focus());

    rerender(<NodeDetailPanel {...props} documentRevision={1} />);

    expect(within(panel()).queryByRole("alert")).toBeNull();
    expect(tagInput()).toHaveValue("");
    expect(screen.getByRole("button", { name: "タグを削除: 果物" })).toBe(deleteButton);
    expect(deleteButton).toHaveFocus();
  });

  it("documentRevision が変わると、出典の節は作り直さずに入力とエラーだけを消し、削除ボタンのフォーカスを保つ（L-588・L-155）", () => {
    const { props, rerender } = renderPanel({
      onAddSource: jest.fn((): AddNodeSourceOutcome => ({ ok: false, reason: "duplicate" })),
    });
    fireEvent.change(sourceTitleInput(), { target: { value: "設計入門" } });
    fireEvent.change(sourcePageInput(), { target: { value: "12" } });
    fireEvent.change(sourceUrlInput(), { target: { value: SOURCE_URL } });
    fireEvent.submit(sourceTitleInput().form!);
    expect(within(panel()).getByRole("alert")).toHaveTextContent("同じ出典がすでに追加されています。");
    const deleteButton = screen.getByRole("button", { name: `出典を削除: 設計入門 p. 12 ${SOURCE_URL}` });
    act(() => deleteButton.focus());

    rerender(<NodeDetailPanel {...props} documentRevision={1} />);

    expect(within(panel()).queryByRole("alert")).toBeNull();
    expect(sourceTitleInput()).toHaveValue("");
    expect(sourcePageInput()).toHaveValue("");
    expect(sourceUrlInput()).toHaveValue("");
    expect(screen.getByRole("button", { name: `出典を削除: 設計入門 p. 12 ${SOURCE_URL}` })).toBe(deleteButton);
    expect(deleteButton).toHaveFocus();
  });

  it("プレビュータブに切り替えた後、選択ノードの id または documentRevision が変わるとタブが編集に戻る（L-588）", () => {
    const { props, rerender } = renderPanel();

    fireEvent.click(screen.getByRole("tab", { name: "プレビュー" }));
    expect(screen.getByRole("tab", { name: "プレビュー" })).toHaveAttribute("aria-selected", "true");

    rerender(<NodeDetailPanel {...props} selectedNode={{ id: 2, label: "みかん", note: "みかんのメモ" }} />);
    expect(screen.getByRole("tab", { name: "編集" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: "プレビュー" }));
    expect(screen.getByRole("tab", { name: "プレビュー" })).toHaveAttribute("aria-selected", "true");

    rerender(<NodeDetailPanel {...props} documentRevision={1} selectedNode={{ id: 2, label: "みかん", note: "みかんのメモ" }} />);
    expect(screen.getByRole("tab", { name: "編集" })).toHaveAttribute("aria-selected", "true");
  });
});
