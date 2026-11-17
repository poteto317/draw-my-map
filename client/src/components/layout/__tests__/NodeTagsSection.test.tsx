import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeTagsSection } from "@/components/layout/NodeTagsSection";
import { NODE_TAGS_MAX_COUNT, addNodeTag, removeNodeTag, type AddNodeTagOutcome } from "@/domain/nodes/nodeTag";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

// タグ名を count 件（tag0 …）
function tagsOf(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `tag${index}`);
}

type HarnessProps = {
  tags?: readonly string[];
  documentRevision?: number;
  onAdd?: jest.Mock;
  onRemove?: jest.Mock;
};

// useNodes の代わりにドメインの addNodeTag・removeNodeTag で状態を持ち、部品と規則を実際の DOM イベントでつなぐ（L-737）
function Harness({ tags, documentRevision = 0, onAdd = jest.fn(), onRemove = jest.fn() }: HarnessProps) {
  const [nodes, setNodes] = useState<Node[]>(() => [
    createTestNode({ id: 1, label: "りんご", ...(tags === undefined ? {} : { tags }) }),
  ]);
  const addTag = (id: number, input: string): AddNodeTagOutcome => {
    onAdd(id, input);
    const result = addNodeTag(nodes, id, input);
    if (!result.ok) return { ok: false, reason: result.reason };
    setNodes(result.nodes);
    return { ok: true };
  };
  const removeTag = (id: number, tag: string): boolean => {
    onRemove(id, tag);
    const next = removeNodeTag(nodes, id, tag);
    if (next === null) return false;
    setNodes(next);
    return true;
  };
  return (
    <NodeTagsSection
      node={nodes[0]}
      documentRevision={documentRevision}
      onAddTag={addTag}
      onRemoveTag={removeTag}
    />
  );
}

function section(): HTMLElement {
  return screen.getByRole("region", { name: "タグ" });
}

function tagInput(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "タグを追加" }) as HTMLInputElement;
}

function addButton(): HTMLElement {
  return screen.getByRole("button", { name: "追加" });
}

function shownTags(): string[] {
  return within(section()).queryAllByRole("listitem").map((item) => item.firstElementChild?.textContent ?? "");
}

describe("NodeTagsSection", () => {
  it("見出し「タグ」の領域に、対象ノードの表示ラベルを出す", () => {
    render(<Harness />);

    expect(within(section()).getByRole("heading", { name: "タグ" })).toBeInTheDocument();
    expect(within(section()).getByText("対象ノード").nextElementSibling).toHaveTextContent("りんご");
  });

  it("未選択では案内だけを出し、入力欄・ボタンを描かない", () => {
    render(<NodeTagsSection node={null} documentRevision={0} onAddTag={jest.fn()} onRemoveTag={jest.fn()} />);

    expect(within(section()).getByText("ノードを選択してください")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("タグが無いときは「タグはありません」と「0 / 10 件」を出す", () => {
    render(<Harness />);

    expect(screen.getByText("タグはありません")).toBeInTheDocument();
    expect(screen.getByText("0 / 10 件")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("タグを追加順に一覧の項目で並べ、各項目に全文の title と削除ボタン（×）を付ける", () => {
    render(<Harness tags={["Python", "重要"]} />);

    expect(shownTags()).toEqual(["Python", "重要"]);
    expect(screen.getByText("Python")).toHaveAttribute("title", "Python");
    const remove = screen.getByRole("button", { name: "タグを削除: Python" });
    expect(remove).toHaveTextContent("×");
    expect(screen.getByText("2 / 10 件")).toBeInTheDocument();
  });

  it("タグ名は文字として出し、HTML として解釈しない", () => {
    render(<Harness tags={["<b>x</b>"]} />);

    expect(screen.getByText("<b>x</b>").tagName).toBe("SPAN");
    expect(section().querySelector("b")).toBeNull();
  });

  it("入力欄は type=text・autocomplete=off・maxLength なしで、フォームはブラウザの検証をしない（noValidate）", () => {
    render(<Harness />);

    expect(tagInput()).toHaveAttribute("type", "text");
    expect(tagInput()).toHaveAttribute("autocomplete", "off");
    expect(tagInput()).not.toHaveAttribute("maxlength");
    expect(tagInput().form).toHaveAttribute("novalidate");
  });

  it("「追加」で入力のまま渡し、まとめた名前が並び、入力欄を空にしてフォーカスを入力欄に置く", async () => {
    const user = userEvent.setup();
    const onAdd = jest.fn();
    render(<Harness onAdd={onAdd} />);

    await user.type(tagInput(), " 機械   学習 ");
    await user.click(addButton());

    expect(onAdd).toHaveBeenCalledWith(1, " 機械   学習 ");
    expect(shownTags()).toEqual(["機械 学習"]);
    expect(tagInput()).toHaveValue("");
    expect(tagInput()).toHaveFocus();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("入力欄の Enter で追加し、確定は送信の 1 か所だけ（Enter 1 回で追加を 1 回だけ呼ぶ。二重確定しない。L-473）", async () => {
    const user = userEvent.setup();
    const onAdd = jest.fn();
    render(<Harness onAdd={onAdd} />);

    await user.type(tagInput(), "重要{Enter}");

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(shownTags()).toEqual(["重要"]);
  });

  it("空のまま追加しても何もしない（追加を呼ばず、エラーも出さない）", async () => {
    const user = userEvent.setup();
    const onAdd = jest.fn();
    render(<Harness onAdd={onAdd} />);

    await user.click(addButton());
    await user.type(tagInput(), "   {Enter}");

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each<[string, string, readonly string[] | undefined, string]>([
    ["表記違いの重複（大文字小文字）", "python", ["Python"], "同じタグがすでに追加されています。"],
    ["表記違いの重複（全角半角）", "Ｐｙｔｈｏｎ", ["Python"], "同じタグがすでに追加されています。"],
    ["長すぎる", "a".repeat(31), undefined, "タグ名が長すぎます（30 文字まで）。"],
    ["使えない文字", "a\u200bb", undefined, "タグ名に使えない文字が含まれています。"],
  ])("%s は理由を role=alert で出し、入力を残す", (_name, value, tags, message) => {
    render(<Harness tags={tags} />);
    fireEvent.change(tagInput(), { target: { value } });

    fireEvent.submit(tagInput().form!);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(tagInput()).toHaveValue(value);
    expect(tagInput()).toHaveAttribute("aria-invalid", "true");
    expect(tagInput().getAttribute("aria-describedby")?.split(" ")).toContain(alert.id);
  });

  it("入力を変えるとエラーを消す", async () => {
    const user = userEvent.setup();
    render(<Harness tags={["Python"]} />);
    await user.type(tagInput(), "python{Enter}");
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.type(tagInput(), "3");

    expect(screen.queryByRole("alert")).toBeNull();
    expect(tagInput()).not.toHaveAttribute("aria-invalid");
  });

  it.each([[{ isComposing: true }], [{ keyCode: 229 }], [{ repeat: true }]])(
    "IME の変換中・押し続けの Enter（%o）では送信しない（L-474・L-408）",
    (init) => {
      const onAdd = jest.fn();
      render(<Harness onAdd={onAdd} />);
      fireEvent.change(tagInput(), { target: { value: "重要" } });

      expect(fireEvent.keyDown(tagInput(), { key: "Enter", ...init })).toBe(false);
      expect(onAdd).not.toHaveBeenCalled();
      expect(fireEvent.keyDown(tagInput(), { key: "Enter" })).toBe(true);
    },
  );

  it("10 件では「上限（10 件）に達しました」を出し、入力欄とボタンは有効のまま、追加すると too-many の文言を出す", () => {
    const onAdd = jest.fn();
    render(<Harness tags={tagsOf(NODE_TAGS_MAX_COUNT)} onAdd={onAdd} />);

    expect(screen.getByRole("status")).toHaveTextContent("上限（10 件）に達しました");
    expect(screen.getByText("10 / 10 件")).toBeInTheDocument();
    expect(tagInput()).toBeEnabled();
    expect(addButton()).toBeEnabled();
    fireEvent.change(tagInput(), { target: { value: "重要" } });
    fireEvent.submit(tagInput().form!);

    expect(onAdd).toHaveBeenCalledWith(1, "重要");
    expect(screen.getByRole("alert")).toHaveTextContent("タグは 1 つのノードに 10 件まで追加できます。");
  });

  it("9 件から 10 件目を追加した直後も、フォーカスは入力欄にある", async () => {
    const user = userEvent.setup();
    render(<Harness tags={tagsOf(9)} />);

    await user.type(tagInput(), "重要");
    await user.click(addButton());

    expect(screen.getByText("10 / 10 件")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("上限（10 件）に達しました");
    expect(tagInput()).toHaveFocus();
  });

  it("削除で指定のタグを消し、押したボタンが消えてもフォーカスを入力欄へ移す（L-155）", async () => {
    const user = userEvent.setup();
    const onRemove = jest.fn();
    render(<Harness tags={["Python", "重要"]} onRemove={onRemove} />);

    await user.click(screen.getByRole("button", { name: "タグを削除: Python" }));

    expect(onRemove).toHaveBeenCalledWith(1, "Python");
    expect(shownTags()).toEqual(["重要"]);
    expect(tagInput()).toHaveFocus();
  });

  it("10 件から 9 件へ削除した直後も、フォーカスは入力欄にあり、上限の表示を消す", async () => {
    const user = userEvent.setup();
    render(<Harness tags={tagsOf(NODE_TAGS_MAX_COUNT)} />);

    await user.click(screen.getByRole("button", { name: "タグを削除: tag9" }));

    expect(screen.getByText("9 / 10 件")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(tagInput()).toHaveFocus();
  });

  it("documentRevision が変わると、作り直さずに入力欄の下書きとエラーを消す（フォーカスと要素はそのまま。L-588・L-155）", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness tags={["Python"]} />);
    await user.type(tagInput(), "python{Enter}");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    const input = tagInput();
    const deleteButton = screen.getByRole("button", { name: "タグを削除: Python" });
    deleteButton.focus();

    rerender(<Harness tags={["Python"]} documentRevision={1} />);

    expect(tagInput()).toBe(input);
    expect(tagInput()).toHaveValue("");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "タグを削除: Python" })).toBe(deleteButton);
    expect(deleteButton).toHaveFocus();
  });

  it("documentRevision が変わらない再描画では、下書きを消さない", () => {
    const { rerender } = render(<Harness />);
    fireEvent.change(tagInput(), { target: { value: "重要" } });

    rerender(<Harness />);

    expect(tagInput()).toHaveValue("重要");
  });
});
