import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeLinksSection } from "@/components/layout/NodeLinksSection";
import { NODE_LINKS_MAX_COUNT, addNodeLink, removeNodeLink, type AddNodeLinkOutcome } from "@/domain/nodes/nodeLink";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

const A = "https://example.com/a";
const B = "https://example.org/b";

// 正規化済みの URL を count 件（https://example.com/link0 …）
function linksOf(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `https://example.com/link${index}`);
}

type HarnessProps = {
  links?: readonly string[];
  documentRevision?: number;
  onAdd?: jest.Mock;
  onRemove?: jest.Mock;
};

// useNodes の代わりにドメインの addNodeLink・removeNodeLink で状態を持ち、部品と規則を実際の DOM イベントでつなぐ（L-737）
function Harness({ links, documentRevision = 0, onAdd = jest.fn(), onRemove = jest.fn() }: HarnessProps) {
  const [nodes, setNodes] = useState<Node[]>(() => [
    createTestNode({ id: 1, label: "りんご", ...(links === undefined ? {} : { links }) }),
  ]);
  const addLink = (id: number, input: string): AddNodeLinkOutcome => {
    onAdd(id, input);
    const result = addNodeLink(nodes, id, input);
    if (!result.ok) return { ok: false, reason: result.reason };
    setNodes(result.nodes);
    return { ok: true };
  };
  const removeLink = (id: number, url: string): boolean => {
    onRemove(id, url);
    const next = removeNodeLink(nodes, id, url);
    if (next === null) return false;
    setNodes(next);
    return true;
  };
  return (
    <NodeLinksSection
      node={nodes[0]}
      documentRevision={documentRevision}
      onAddLink={addLink}
      onRemoveLink={removeLink}
    />
  );
}

function section(): HTMLElement {
  return screen.getByRole("region", { name: "リンク" });
}

function urlInput(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "URLを追加" }) as HTMLInputElement;
}

function addButton(): HTMLElement {
  return screen.getByRole("button", { name: "追加" });
}

describe("NodeLinksSection", () => {
  it("見出し「リンク」の領域に、対象ノードの表示ラベルを出す", () => {
    render(<Harness />);

    expect(within(section()).getByRole("heading", { name: "リンク" })).toBeInTheDocument();
    expect(within(section()).getByText("対象ノード").nextElementSibling).toHaveTextContent("りんご");
  });

  it("未選択では案内だけを出し、入力欄・ボタンを描かない", () => {
    render(<NodeLinksSection node={null} documentRevision={0} onAddLink={jest.fn()} onRemoveLink={jest.fn()} />);

    expect(within(section()).getByText("ノードを選択してください")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("URL が無いときは「リンクはありません」と「0 / 10 件」を出す", () => {
    render(<Harness />);

    expect(screen.getByText("リンクはありません")).toBeInTheDocument();
    expect(screen.getByText("0 / 10 件")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("URL を順に、新しいタブで開くリンク（noopener noreferrer）と削除ボタンで並べる", () => {
    render(<Harness links={[A, B]} />);

    const links = within(section()).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([A, B]);
    expect(links[0]).toHaveAttribute("href", A);
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
    expect(links[0]).toHaveAttribute("title", A);
    expect(screen.getByRole("button", { name: `リンクを削除: ${A}` })).toBeInTheDocument();
    expect(screen.getByText("2 / 10 件")).toBeInTheDocument();
  });

  it("正規化済みの http/https でない値は <a> にせず、文字だけを出す（toSafeLinkHref が null）", () => {
    render(
      <NodeLinksSection
        node={{ id: 1, label: "a", links: ["javascript:alert(1)", "https://example.com"] }}
        documentRevision={0}
        onAddLink={jest.fn()}
        onRemoveLink={jest.fn()}
      />,
    );

    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText("javascript:alert(1)").tagName).toBe("SPAN");
    expect(screen.getByText("https://example.com").tagName).toBe("SPAN");
  });

  it("入力欄は type=url・autocomplete=off・maxLength なしで、フォームはブラウザの検証をしない（noValidate）", () => {
    render(<Harness />);

    expect(urlInput()).toHaveAttribute("type", "url");
    expect(urlInput()).toHaveAttribute("autocomplete", "off");
    expect(urlInput()).not.toHaveAttribute("maxlength");
    expect(urlInput().form).toHaveAttribute("novalidate");
  });

  it("「追加」で入力のまま渡し、正規化した URL が並び、入力欄を空にしてフォーカスを入力欄に置く", async () => {
    const user = userEvent.setup();
    const onAdd = jest.fn();
    render(<Harness onAdd={onAdd} />);

    await user.type(urlInput(), "HTTPS://Example.com/docs");
    await user.click(addButton());

    expect(onAdd).toHaveBeenCalledWith(1, "HTTPS://Example.com/docs");
    expect(screen.getByRole("link", { name: "https://example.com/docs" })).toBeInTheDocument();
    expect(urlInput()).toHaveValue("");
    expect(urlInput()).toHaveFocus();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("入力欄の Enter で追加する", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(urlInput(), `${A}{Enter}`);

    expect(screen.getByRole("link", { name: A })).toBeInTheDocument();
  });

  it("空のまま追加しても何もしない（追加を呼ばず、エラーも出さない）", async () => {
    const user = userEvent.setup();
    const onAdd = jest.fn();
    render(<Harness onAdd={onAdd} />);

    await user.click(addButton());
    await user.type(urlInput(), "   {Enter}");

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each<[string, string, readonly string[] | undefined, string]>([
    ["javascript:", "javascript:alert(1)", undefined, "http または https の URL だけを追加できます。"],
    ["スキームが無い", "example.com", undefined, "URLの形式が正しくありません。https:// から始まる URL を入力してください。"],
    ["資格情報つき", "https://user:pass@example.com/", undefined, "ユーザー名やパスワードを含む URL は追加できません。"],
    ["重複", "https://EXAMPLE.com/a", [A], "同じ URL がすでに追加されています。"],
    ["長すぎる", `https://example.com/${"a".repeat(2048)}`, undefined, "URLが長すぎます（2,048 文字まで。日本語などはエンコードで長くなります）。"],
  ])("%s は理由を role=alert で出し、入力を残す", (_name, value, links, message) => {
    render(<Harness links={links} />);
    fireEvent.change(urlInput(), { target: { value } });

    fireEvent.submit(urlInput().form!);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(urlInput()).toHaveValue(value);
    expect(urlInput()).toHaveAttribute("aria-invalid", "true");
    expect(urlInput().getAttribute("aria-describedby")?.split(" ")).toContain(alert.id);
  });

  it("入力を変えるとエラーを消す", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(urlInput(), "example.com{Enter}");
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.type(urlInput(), "/");

    expect(screen.queryByRole("alert")).toBeNull();
    expect(urlInput()).not.toHaveAttribute("aria-invalid");
  });

  it.each([[{ isComposing: true }], [{ keyCode: 229 }], [{ repeat: true }]])(
    "IME の変換中・押し続けの Enter（%o）では送信しない（L-474・L-408）",
    (init) => {
      const onAdd = jest.fn();
      render(<Harness onAdd={onAdd} />);
      fireEvent.change(urlInput(), { target: { value: A } });

      expect(fireEvent.keyDown(urlInput(), { key: "Enter", ...init })).toBe(false);
      expect(onAdd).not.toHaveBeenCalled();
      expect(fireEvent.keyDown(urlInput(), { key: "Enter" })).toBe(true);
    },
  );

  it("10 件では「上限（10 件）に達しました」を出し、入力欄とボタンは有効のまま、追加すると too-many の文言を出す", () => {
    const onAdd = jest.fn();
    render(<Harness links={linksOf(NODE_LINKS_MAX_COUNT)} onAdd={onAdd} />);

    expect(screen.getByRole("status")).toHaveTextContent("上限（10 件）に達しました");
    expect(screen.getByText("10 / 10 件")).toBeInTheDocument();
    expect(urlInput()).toBeEnabled();
    expect(addButton()).toBeEnabled();
    fireEvent.change(urlInput(), { target: { value: A } });
    fireEvent.submit(urlInput().form!);

    expect(onAdd).toHaveBeenCalledWith(1, A);
    expect(screen.getByRole("alert")).toHaveTextContent("リンクは 1 つのノードに 10 件まで追加できます。");
  });

  it("9 件から 10 件目を追加した直後も、フォーカスは入力欄にある", async () => {
    const user = userEvent.setup();
    render(<Harness links={linksOf(9)} />);

    await user.type(urlInput(), A);
    await user.click(addButton());

    expect(screen.getByText("10 / 10 件")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("上限（10 件）に達しました");
    expect(urlInput()).toHaveFocus();
  });

  it("削除で指定の URL を消し、押したボタンが消えてもフォーカスを入力欄へ移す（L-155）", async () => {
    const user = userEvent.setup();
    const onRemove = jest.fn();
    render(<Harness links={[A, B]} onRemove={onRemove} />);

    await user.click(screen.getByRole("button", { name: `リンクを削除: ${A}` }));

    expect(onRemove).toHaveBeenCalledWith(1, A);
    expect(within(section()).getAllByRole("link").map((link) => link.textContent)).toEqual([B]);
    expect(urlInput()).toHaveFocus();
  });

  it("10 件から 9 件へ削除した直後も、フォーカスは入力欄にあり、上限の表示を消す", async () => {
    const user = userEvent.setup();
    render(<Harness links={linksOf(NODE_LINKS_MAX_COUNT)} />);

    await user.click(screen.getByRole("button", { name: "リンクを削除: https://example.com/link9" }));

    expect(screen.getByText("9 / 10 件")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(urlInput()).toHaveFocus();
  });
  it("documentRevision が変わると、作り直さずに入力欄の下書きとエラーを消す（フォーカスと要素はそのまま。L-588・L-155）", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness links={[A]} />);
    await user.type(urlInput(), "example.com{Enter}");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    const input = urlInput();
    const deleteButton = screen.getByRole("button", { name: `リンクを削除: ${A}` });
    deleteButton.focus();

    rerender(<Harness links={[A]} documentRevision={1} />);

    expect(urlInput()).toBe(input);
    expect(urlInput()).toHaveValue("");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: `リンクを削除: ${A}` })).toBe(deleteButton);
    expect(deleteButton).toHaveFocus();
  });

  it("documentRevision が変わらない再描画では、下書きを消さない", () => {
    const { rerender } = render(<Harness />);
    fireEvent.change(urlInput(), { target: { value: A } });

    rerender(<Harness />);

    expect(urlInput()).toHaveValue(A);
  });
});
