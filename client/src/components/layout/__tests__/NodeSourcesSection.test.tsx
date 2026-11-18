import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeSourcesSection } from "@/components/layout/NodeSourcesSection";
import {
  NODE_SOURCES_MAX_COUNT,
  addNodeSource,
  removeNodeSource,
  type AddNodeSourceOutcome,
  type NodeSourceInput,
} from "@/domain/nodes/nodeSource";
import { createTestNode } from "@/testing/createTestNode";
import type { Node, NodeSource } from "@/types/node";

const A_URL = "https://example.com/a";
const B_URL = "https://example.org/b";

function source(title: string, page?: string, url?: string): NodeSource {
  return {
    title,
    ...(page === undefined ? {} : { page }),
    ...(url === undefined ? {} : { url }),
  };
}

// 正規化済みの出典を count 件（title0 …）
function sourcesOf(count: number): NodeSource[] {
  return Array.from({ length: count }, (_, index) => source(`title${index}`));
}

type HarnessProps = {
  sources?: readonly NodeSource[];
  documentRevision?: number;
  onAdd?: jest.Mock;
  onRemove?: jest.Mock;
};

// useNodes の代わりにドメインの addNodeSource・removeNodeSource で状態を持ち、部品と規則を実際の DOM イベントでつなぐ（L-737）
function Harness({ sources, documentRevision = 0, onAdd = jest.fn(), onRemove = jest.fn() }: HarnessProps) {
  const [nodes, setNodes] = useState<Node[]>(() => [
    createTestNode({ id: 1, label: "りんご", ...(sources === undefined ? {} : { sources }) }),
  ]);
  const addSource = (id: number, input: NodeSourceInput): AddNodeSourceOutcome => {
    onAdd(id, input);
    const result = addNodeSource(nodes, id, input);
    if (!result.ok) return { ok: false, reason: result.reason };
    setNodes(result.nodes);
    return { ok: true };
  };
  const removeSource = (id: number, index: number): boolean => {
    onRemove(id, index);
    const next = removeNodeSource(nodes, id, index);
    if (next === null) return false;
    setNodes(next);
    return true;
  };
  return (
    <NodeSourcesSection
      node={nodes[0]}
      documentRevision={documentRevision}
      onAddSource={addSource}
      onRemoveSource={removeSource}
    />
  );
}

function section(): HTMLElement {
  return screen.getByRole("region", { name: "出典" });
}

function titleInput(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "タイトル" }) as HTMLInputElement;
}

function pageInput(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "ページ" }) as HTMLInputElement;
}

function urlInput(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "URL" }) as HTMLInputElement;
}

function addButton(): HTMLElement {
  return screen.getByRole("button", { name: "追加" });
}

describe("NodeSourcesSection", () => {
  it("見出し「出典」の領域に、対象ノードの表示ラベルを出す", () => {
    render(<Harness />);

    expect(within(section()).getByRole("heading", { name: "出典" })).toBeInTheDocument();
    expect(within(section()).getByText("対象ノード").nextElementSibling).toHaveTextContent("りんご");
  });

  it("未選択では案内だけを出し、入力欄・ボタンを描かない", () => {
    render(
      <NodeSourcesSection node={null} documentRevision={0} onAddSource={jest.fn()} onRemoveSource={jest.fn()} />,
    );

    expect(within(section()).getByText("ノードを選択してください")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("出典が無いときは「出典はありません」と「0 / 10 件」を出す", () => {
    render(<Harness />);

    expect(screen.getByText("出典はありません")).toBeInTheDocument();
    expect(screen.getByText("0 / 10 件")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("出典を順に並べ、ページは常に p. {page}、URL は新しいタブ（noopener noreferrer）、削除は × で aria-label に page/url を含む", () => {
    render(
      <Harness
        sources={[
          source("設計入門", "12", A_URL),
          source("設計入門", "99", B_URL),
          source("メモのみ"),
        ]}
      />,
    );

    const items = within(section()).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("設計入門");
    expect(items[0]).toHaveTextContent("p. 12");
    const linkA = within(items[0]).getByRole("link");
    expect(linkA).toHaveAttribute("href", A_URL);
    expect(linkA).toHaveAttribute("target", "_blank");
    expect(linkA).toHaveAttribute("rel", "noopener noreferrer");
    const removeA = screen.getByRole("button", { name: `出典を削除: 設計入門 p. 12 ${A_URL}` });
    expect(removeA).toBeInTheDocument();
    expect(removeA.querySelector("[aria-hidden='true']")).toHaveTextContent("×");

    expect(items[1]).toHaveTextContent("設計入門");
    expect(items[1]).toHaveTextContent("p. 99");
    expect(within(items[1]).getByRole("link")).toHaveAttribute("href", B_URL);
    expect(screen.getByRole("button", { name: `出典を削除: 設計入門 p. 99 ${B_URL}` })).toBeInTheDocument();

    expect(items[2]).toHaveTextContent("メモのみ");
    expect(within(items[2]).queryByRole("link")).toBeNull();
    expect(screen.getByRole("button", { name: "出典を削除: メモのみ" })).toBeInTheDocument();
    expect(screen.getByText("3 / 10 件")).toBeInTheDocument();
  });

  it("正規化済みの http/https でない URL は <a> にせず、文字だけを出す（toSafeLinkHref が null）", () => {
    render(
      <NodeSourcesSection
        node={{
          id: 1,
          label: "a",
          sources: [
            source("危険", undefined, "javascript:alert(1)"),
            source("安全", undefined, "https://example.com"),
          ],
        }}
        documentRevision={0}
        onAddSource={jest.fn()}
        onRemoveSource={jest.fn()}
      />,
    );

    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText("javascript:alert(1)").tagName).toBe("SPAN");
    expect(screen.getByText("https://example.com").tagName).toBe("SPAN");
  });

  it("入力欄は autocomplete=off・maxLength なしで、URL は type=url、フォームはブラウザの検証をしない（noValidate）", () => {
    render(<Harness />);

    expect(titleInput()).toHaveAttribute("autocomplete", "off");
    expect(titleInput()).not.toHaveAttribute("maxlength");
    expect(pageInput()).toHaveAttribute("autocomplete", "off");
    expect(pageInput()).not.toHaveAttribute("maxlength");
    expect(urlInput()).toHaveAttribute("type", "url");
    expect(urlInput()).toHaveAttribute("autocomplete", "off");
    expect(urlInput()).not.toHaveAttribute("maxlength");
    expect(titleInput().form).toHaveAttribute("novalidate");
  });

  it("「追加」で 3 欄を渡し、正規化した出典が並び、3 欄を空にしてフォーカスをタイトル入力欄に置く", async () => {
    const user = userEvent.setup();
    const onAdd = jest.fn();
    render(<Harness onAdd={onAdd} />);

    await user.type(titleInput(), "  設計   入門  ");
    await user.type(pageInput(), " 12 ");
    await user.type(urlInput(), "HTTPS://Example.com/docs");
    await user.click(addButton());

    expect(onAdd).toHaveBeenCalledWith(1, {
      title: "  設計   入門  ",
      page: " 12 ",
      url: "HTTPS://Example.com/docs",
    });
    expect(within(section()).getByText("設計 入門")).toBeInTheDocument();
    expect(within(section()).getByText("p. 12")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://example.com/docs" })).toBeInTheDocument();
    expect(titleInput()).toHaveValue("");
    expect(pageInput()).toHaveValue("");
    expect(urlInput()).toHaveValue("");
    expect(titleInput()).toHaveFocus();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("タイトル入力欄の Enter で追加する", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(titleInput(), "設計入門{Enter}");

    expect(within(section()).getByText("設計入門")).toBeInTheDocument();
  });

  it("タイトルが空（ページ/URL だけの送信を含む）のときは何もしない（追加を呼ばず、エラーも出さない）", async () => {
    const user = userEvent.setup();
    const onAdd = jest.fn();
    render(<Harness onAdd={onAdd} />);

    await user.click(addButton());
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();

    await user.type(pageInput(), "12");
    await user.type(urlInput(), A_URL);
    await user.click(addButton());
    await user.type(titleInput(), "   {Enter}");

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each<[string, NodeSourceInput, readonly NodeSource[] | undefined, string, "title" | "page" | "url"]>([
    ["長すぎるタイトル", { title: "あ".repeat(201) }, undefined, "出典のタイトルが長すぎます（200 文字まで）。", "title"],
    ["使えないタイトル", { title: "a\u0000b" }, undefined, "出典のタイトルに使えない文字が含まれています。", "title"],
    ["長すぎるページ", { title: "設計", page: "あ".repeat(81) }, undefined, "出典のページが長すぎます（80 文字まで）。", "page"],
    ["使えないページ", { title: "設計", page: "a\u0000b" }, undefined, "出典のページに使えない文字が含まれています。", "page"],
    ["javascript: URL", { title: "設計", url: "javascript:alert(1)" }, undefined, "http または https の URL だけを追加できます。", "url"],
    ["資格情報つき", { title: "設計", url: "https://user:pass@example.com/" }, undefined, "ユーザー名やパスワードを含む URL は追加できません。", "url"],
    ["重複", { title: "設計入門", page: "12" }, [source("設計入門", "12")], "同じ出典がすでに追加されています。", "title"],
  ])("%s は理由を role=alert で出し、失敗した欄だけに aria-invalid を付ける", (_name, input, sources, message, field) => {
    render(<Harness sources={sources} />);
    fireEvent.change(titleInput(), { target: { value: input.title } });
    if (input.page !== undefined) fireEvent.change(pageInput(), { target: { value: input.page } });
    if (input.url !== undefined) fireEvent.change(urlInput(), { target: { value: input.url } });

    fireEvent.submit(titleInput().form!);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(titleInput()).toHaveValue(input.title);
    if (input.page !== undefined) expect(pageInput()).toHaveValue(input.page);
    if (input.url !== undefined) expect(urlInput()).toHaveValue(input.url);

    const invalidInput = field === "title" ? titleInput() : field === "page" ? pageInput() : urlInput();
    const otherInputs = [titleInput(), pageInput(), urlInput()].filter((el) => el !== invalidInput);
    expect(invalidInput).toHaveAttribute("aria-invalid", "true");
    expect(invalidInput.getAttribute("aria-describedby")?.split(" ")).toContain(alert.id);
    for (const other of otherInputs) {
      expect(other).not.toHaveAttribute("aria-invalid");
      expect(other.getAttribute("aria-describedby")?.split(" ") ?? []).not.toContain(alert.id);
    }
  });

  it("「追加」はフォーム末尾の独立した行にあり、URL 入力と同じ行に置かない", () => {
    render(<Harness />);

    const form = titleInput().form!;
    expect(urlInput().parentElement).not.toContainElement(addButton());
    expect(form.lastElementChild).toContainElement(addButton());
  });

  it("入力を変えるとエラーを消す", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(titleInput(), "a\u0000b{Enter}");
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.type(titleInput(), "x");

    expect(screen.queryByRole("alert")).toBeNull();
    expect(titleInput()).not.toHaveAttribute("aria-invalid");
  });

  it.each([[{ isComposing: true }], [{ keyCode: 229 }], [{ repeat: true }]])(
    "IME の変換中・押し続けの Enter（%o）では送信しない（L-474・L-408）",
    (init) => {
      const onAdd = jest.fn();
      render(<Harness onAdd={onAdd} />);
      fireEvent.change(titleInput(), { target: { value: "設計" } });

      expect(fireEvent.keyDown(titleInput(), { key: "Enter", ...init })).toBe(false);
      expect(onAdd).not.toHaveBeenCalled();
      expect(fireEvent.keyDown(pageInput(), { key: "Enter", ...init })).toBe(false);
      expect(onAdd).not.toHaveBeenCalled();
      expect(fireEvent.keyDown(urlInput(), { key: "Enter", ...init })).toBe(false);
      expect(onAdd).not.toHaveBeenCalled();
      expect(fireEvent.keyDown(titleInput(), { key: "Enter" })).toBe(true);
    },
  );

  it("10 件では「上限（10 件）に達しました」を出し、入力欄とボタンは有効のまま、追加すると too-many の文言を出す", () => {
    const onAdd = jest.fn();
    render(<Harness sources={sourcesOf(NODE_SOURCES_MAX_COUNT)} onAdd={onAdd} />);

    expect(screen.getByRole("status")).toHaveTextContent("上限（10 件）に達しました");
    expect(screen.getByText("10 / 10 件")).toBeInTheDocument();
    expect(titleInput()).toBeEnabled();
    expect(pageInput()).toBeEnabled();
    expect(urlInput()).toBeEnabled();
    expect(addButton()).toBeEnabled();
    fireEvent.change(titleInput(), { target: { value: "追加" } });
    fireEvent.submit(titleInput().form!);

    expect(onAdd).toHaveBeenCalledWith(1, { title: "追加", page: "", url: "" });
    expect(screen.getByRole("alert")).toHaveTextContent("出典は 1 つのノードに 10 件まで追加できます。");
  });

  it("9 件から 10 件目を追加した直後も、フォーカスはタイトル入力欄にある", async () => {
    const user = userEvent.setup();
    render(<Harness sources={sourcesOf(9)} />);

    await user.type(titleInput(), "追加");
    await user.click(addButton());

    expect(screen.getByText("10 / 10 件")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("上限（10 件）に達しました");
    expect(titleInput()).toHaveFocus();
  });

  it("削除で指定の index を消し、押したボタンが消えてもフォーカスをタイトル入力欄へ移す（L-155）", async () => {
    const user = userEvent.setup();
    const onRemove = jest.fn();
    render(
      <Harness
        sources={[source("設計入門", "1"), source("実装ガイド", "2")]}
        onRemove={onRemove}
      />,
    );

    await user.click(screen.getByRole("button", { name: "出典を削除: 設計入門 p. 1" }));

    expect(onRemove).toHaveBeenCalledWith(1, 0);
    expect(within(section()).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      expect.stringContaining("実装ガイド"),
    ]);
    expect(titleInput()).toHaveFocus();
  });

  it("10 件から 9 件へ削除した直後も、フォーカスはタイトル入力欄にあり、上限の表示を消す", async () => {
    const user = userEvent.setup();
    render(<Harness sources={sourcesOf(NODE_SOURCES_MAX_COUNT)} />);

    await user.click(screen.getByRole("button", { name: "出典を削除: title9" }));

    expect(screen.getByText("9 / 10 件")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(titleInput()).toHaveFocus();
  });

  it("documentRevision が変わると、作り直さずに入力欄の下書きとエラーを消す（フォーカスと要素はそのまま。L-588・L-155）", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness sources={[source("設計入門")]} />);
    await user.type(titleInput(), "a\u0000b{Enter}");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.change(pageInput(), { target: { value: "12" } });
    fireEvent.change(urlInput(), { target: { value: A_URL } });
    const title = titleInput();
    const page = pageInput();
    const url = urlInput();
    const deleteButton = screen.getByRole("button", { name: "出典を削除: 設計入門" });
    deleteButton.focus();

    rerender(<Harness sources={[source("設計入門")]} documentRevision={1} />);

    expect(titleInput()).toBe(title);
    expect(pageInput()).toBe(page);
    expect(urlInput()).toBe(url);
    expect(titleInput()).toHaveValue("");
    expect(pageInput()).toHaveValue("");
    expect(urlInput()).toHaveValue("");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "出典を削除: 設計入門" })).toBe(deleteButton);
    expect(deleteButton).toHaveFocus();
  });

  it("documentRevision が変わらない再描画では、下書きを消さない", () => {
    const { rerender } = render(<Harness />);
    fireEvent.change(titleInput(), { target: { value: "設計" } });
    fireEvent.change(pageInput(), { target: { value: "12" } });
    fireEvent.change(urlInput(), { target: { value: A_URL } });

    rerender(<Harness />);

    expect(titleInput()).toHaveValue("設計");
    expect(pageInput()).toHaveValue("12");
    expect(urlInput()).toHaveValue(A_URL);
  });
});
