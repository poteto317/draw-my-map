import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { FALLBACK_NODE_LABEL } from "@/config/nodeLabel";
import { NodeNoteSection } from "@/components/layout/NodeNoteSection";
import type { NodeNoteEditing } from "@/hooks/useNodeNoteEditing";

function editing(overrides: Partial<NodeNoteEditing> = {}): NodeNoteEditing {
  return {
    value: "メモ",
    length: 2,
    isAtLimit: false,
    onFocus: jest.fn(),
    onChange: jest.fn(),
    onBlur: jest.fn(),
    onKeyDown: jest.fn(),
    onCompositionStart: jest.fn(),
    onCompositionEnd: jest.fn(),
    ...overrides,
  };
}

function box(): HTMLTextAreaElement {
  return screen.getByRole("textbox", { name: "詳細メモ" }) as HTMLTextAreaElement;
}

describe("NodeNoteSection", () => {
  it("未選択のときは案内を出し、テキスト欄を無効にして 0 文字と表示する", () => {
    render(<NodeNoteSection targetLabel={null} selectionCount={0} editing={null} />);

    expect(screen.getByRole("heading", { name: "詳細メモ" })).toBeInTheDocument();
    expect(screen.getByText("ノードを選択してください")).toBeVisible();
    expect(box()).toBeDisabled();
    expect(box()).toHaveValue("");
    expect(screen.getByText("0 / 10,000 文字")).toBeInTheDocument();
  });

  it("選択があるときは対象のラベル（title つき）と、ラベルの付いたテキスト欄を出す", () => {
    render(<NodeNoteSection targetLabel="企画の背景" selectionCount={1} editing={editing({ value: "背景の説明", length: 5 })} />);

    expect(screen.getByText("企画の背景")).toHaveAttribute("title", "企画の背景");
    expect(screen.queryByText("ノードを選択してください")).toBeNull();
    expect(box()).toBeEnabled();
    expect(box()).toHaveValue("背景の説明");
    expect(box()).toHaveAttribute("maxLength", "10000");
    expect(box()).toHaveAttribute("rows", "8");
    expect(box()).toHaveAttribute("placeholder", "このノードの詳細な説明を書けます");
    expect(box()).toHaveClass("resize-y");
    expect(screen.getByText("5 / 10,000 文字")).toBeInTheDocument();
  });

  it("ラベルが空のノードでは共通のフォールバックラベルを出し、title は付けない", () => {
    render(<NodeNoteSection targetLabel="" selectionCount={1} editing={editing()} />);

    expect(screen.getByText(FALLBACK_NODE_LABEL)).not.toHaveAttribute("title");
  });

  it("選択が 2 件以上のときだけ、主選択のメモを編集すると示す", () => {
    const { rerender } = render(<NodeNoteSection targetLabel="a" selectionCount={1} editing={editing()} />);
    expect(screen.queryByText(/件選択中/)).toBeNull();

    rerender(<NodeNoteSection targetLabel="a" selectionCount={3} editing={editing()} />);
    expect(screen.getByText("3 件選択中。主選択のノードのメモを編集します")).toBeInTheDocument();
  });

  it("上限に達したら、常設の status 領域に「上限に達しました」を出し、文字数の表示も残す（L-160）", () => {
    const { rerender } = render(<NodeNoteSection targetLabel="a" selectionCount={1} editing={editing({ length: 9999, isAtLimit: false })} />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("");

    rerender(<NodeNoteSection targetLabel="a" selectionCount={1} editing={editing({ length: 10000, isAtLimit: true })} />);
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("上限に達しました");
    expect(screen.getByText("10,000 / 10,000 文字")).toBeInTheDocument();
  });

  it("テキスト欄のイベントをそれぞれのハンドラへ渡す", () => {
    const handlers = editing();
    render(<NodeNoteSection targetLabel="a" selectionCount={1} editing={handlers} />);

    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: "入力" } });
    fireEvent.compositionStart(box());
    fireEvent.compositionEnd(box());
    fireEvent.keyDown(box(), { key: "Escape" });
    fireEvent.blur(box());

    expect(handlers.onFocus).toHaveBeenCalledTimes(1);
    expect(handlers.onChange).toHaveBeenCalledWith("入力");
    expect(handlers.onCompositionStart).toHaveBeenCalledTimes(1);
    expect(handlers.onCompositionEnd).toHaveBeenCalledTimes(1);
    expect(handlers.onKeyDown).toHaveBeenCalledTimes(1);
    expect(handlers.onBlur).toHaveBeenCalledTimes(1);
  });

  it("未選択のときはタブリストとタブパネルを描画しない", () => {
    render(<NodeNoteSection targetLabel={null} selectionCount={0} editing={null} />);

    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("tabpanel", { hidden: true })).toBeNull();
  });

  it("選択時は編集・プレビューの 2 タブと 2 パネルを持ち、初期状態では編集が選択されプレビューのパネルが hidden になり、プレビューの中身は描画しない（L-552・L-411）", () => {
    render(<NodeNoteSection targetLabel="a" selectionCount={1} editing={editing({ value: "# 見出し" })} />);

    const tablist = screen.getByRole("tablist", { name: "詳細メモの表示切替" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["編集", "プレビュー"]);

    const editTab = screen.getByRole("tab", { name: "編集" });
    const previewTab = screen.getByRole("tab", { name: "プレビュー" });
    expect(editTab).toHaveAttribute("aria-selected", "true");
    expect(editTab).toHaveAttribute("tabindex", "0");
    expect(previewTab).toHaveAttribute("aria-selected", "false");
    expect(previewTab).toHaveAttribute("tabindex", "-1");

    const panels = screen.getAllByRole("tabpanel", { hidden: true });
    expect(panels).toHaveLength(2);
    const editPanel = screen.getByRole("tabpanel", { name: "編集" });
    const previewPanel = panels.find((panel) => panel.id === previewTab.getAttribute("aria-controls"));
    expect(previewPanel).toBeDefined();
    expect(editPanel).not.toHaveAttribute("hidden");
    expect(previewPanel).toHaveAttribute("hidden");
    expect(previewPanel).toBeEmptyDOMElement();
    expect(editTab).toHaveAttribute("aria-controls", editPanel.id);
    expect(previewPanel).toHaveAttribute("aria-labelledby", previewTab.id);
  });

  it("mode='preview' ではプレビュータブとプレビューパネルが有効になり、編集パネルは hidden のまま残り、文字数表示も見える", () => {
    render(
      <NodeNoteSection
        targetLabel="a"
        selectionCount={1}
        editing={editing({ value: "# 見出し\n\n本文", length: 8 })}
        mode="preview"
      />,
    );

    const editTab = screen.getByRole("tab", { name: "編集" });
    const previewTab = screen.getByRole("tab", { name: "プレビュー" });
    expect(editTab).toHaveAttribute("aria-selected", "false");
    expect(editTab).toHaveAttribute("tabindex", "-1");
    expect(previewTab).toHaveAttribute("aria-selected", "true");
    expect(previewTab).toHaveAttribute("tabindex", "0");

    const panels = screen.getAllByRole("tabpanel", { hidden: true });
    expect(panels).toHaveLength(2);
    const editPanel = panels.find((panel) => panel.id === editTab.getAttribute("aria-controls"));
    const previewPanel = screen.getByRole("tabpanel", { name: "プレビュー" });
    expect(editPanel).toBeDefined();
    expect(editPanel).toHaveAttribute("hidden");
    expect(editPanel).toHaveAttribute("aria-labelledby", editTab.id);
    expect(previewPanel).not.toHaveAttribute("hidden");
    expect(within(previewPanel).getByRole("heading", { level: 1, name: "見出し" })).toBeVisible();
    expect(screen.getByText("8 / 10,000 文字")).toBeVisible();
  });

  it("tablist の ArrowRight / ArrowLeft / Home / End で切り替えとフォーカス移動ができ、修飾キー付きでは切り替わらない", () => {
    const onModeChange = jest.fn();
    const { rerender } = render(
      <NodeNoteSection targetLabel="a" selectionCount={1} editing={editing()} mode="edit" onModeChange={onModeChange} />,
    );

    const tablist = screen.getByRole("tablist", { name: "詳細メモの表示切替" });
    const editTab = screen.getByRole("tab", { name: "編集" });
    const previewTab = screen.getByRole("tab", { name: "プレビュー" });

    act(() => editTab.focus());
    fireEvent.keyDown(tablist, { key: "ArrowRight", altKey: true });
    fireEvent.keyDown(tablist, { key: "ArrowRight", ctrlKey: true });
    fireEvent.keyDown(tablist, { key: "ArrowRight", metaKey: true });
    expect(onModeChange).not.toHaveBeenCalled();

    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(onModeChange).toHaveBeenLastCalledWith("preview");
    expect(previewTab).toHaveFocus();

    rerender(
      <NodeNoteSection targetLabel="a" selectionCount={1} editing={editing()} mode="preview" onModeChange={onModeChange} />,
    );
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(onModeChange).toHaveBeenLastCalledWith("edit");
    expect(editTab).toHaveFocus();

    rerender(
      <NodeNoteSection targetLabel="a" selectionCount={1} editing={editing()} mode="edit" onModeChange={onModeChange} />,
    );
    fireEvent.keyDown(tablist, { key: "End" });
    expect(onModeChange).toHaveBeenLastCalledWith("preview");
    expect(previewTab).toHaveFocus();

    rerender(
      <NodeNoteSection targetLabel="a" selectionCount={1} editing={editing()} mode="preview" onModeChange={onModeChange} />,
    );
    fireEvent.keyDown(tablist, { key: "Home" });
    expect(onModeChange).toHaveBeenLastCalledWith("edit");
    expect(editTab).toHaveFocus();

    // 逆方向の矢印キー循環（edit で ArrowLeft → preview、preview で ArrowRight → edit）
    rerender(
      <NodeNoteSection targetLabel="a" selectionCount={1} editing={editing()} mode="edit" onModeChange={onModeChange} />,
    );
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(onModeChange).toHaveBeenLastCalledWith("preview");
    expect(previewTab).toHaveFocus();

    rerender(
      <NodeNoteSection targetLabel="a" selectionCount={1} editing={editing()} mode="preview" onModeChange={onModeChange} />,
    );
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(onModeChange).toHaveBeenLastCalledWith("edit");
    expect(editTab).toHaveFocus();

    // すでに選択中のタブへの移動キー（preview で End、edit で Home）や無関係なキーでは onModeChange を呼ばない
    onModeChange.mockClear();
    fireEvent.keyDown(tablist, { key: "End" });
    fireEvent.keyDown(tablist, { key: "Enter" });
    fireEvent.keyDown(tablist, { key: "ArrowDown" });
    expect(onModeChange).not.toHaveBeenCalled();

    rerender(
      <NodeNoteSection targetLabel="a" selectionCount={1} editing={editing()} mode="edit" onModeChange={onModeChange} />,
    );
    fireEvent.keyDown(tablist, { key: "Home" });
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it("すでに選択中のタブをクリックしても onModeChange を呼ばず、別タブをクリックしたときだけ呼ぶ", () => {
    const onModeChange = jest.fn();
    const { rerender } = render(
      <NodeNoteSection targetLabel="a" selectionCount={1} editing={editing()} mode="edit" onModeChange={onModeChange} />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "編集" }));
    expect(onModeChange).not.toHaveBeenCalled();

    rerender(
      <NodeNoteSection targetLabel="a" selectionCount={1} editing={editing()} mode="preview" onModeChange={onModeChange} />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "プレビュー" }));
    expect(onModeChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: "編集" }));
    expect(onModeChange).toHaveBeenCalledTimes(1);
    expect(onModeChange).toHaveBeenLastCalledWith("edit");
  });

  it("textarea にフォーカスがある状態でプレビュータブを押すと、先に onBlur を呼んでから onModeChange('preview') を呼ぶ（L-473）", () => {
    const callOrder: string[] = [];
    const handlers = editing({
      onBlur: jest.fn(() => { callOrder.push("blur"); }),
    });
    const onModeChange = jest.fn((nextMode) => { callOrder.push(`mode:${nextMode}`); });

    render(
      <NodeNoteSection targetLabel="a" selectionCount={1} editing={handlers} mode="edit" onModeChange={onModeChange} />,
    );

    act(() => box().focus());
    fireEvent.click(screen.getByRole("tab", { name: "プレビュー" }));

    expect(callOrder).toEqual(["blur", "mode:preview"]);
  });
});
