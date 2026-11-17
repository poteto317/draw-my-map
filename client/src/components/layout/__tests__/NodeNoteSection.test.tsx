import { fireEvent, render, screen } from "@testing-library/react";
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
});
