import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeSearchBox } from "@/components/layout/NodeSearchBox";
import type { NodeSearchListItem } from "@/types/nodeSearch";

const matches: readonly NodeSearchListItem[] = [
  { nodeId: 10, label: "親あり", parentLabel: "親ノード", hidden: false },
  { nodeId: 20, label: "非表示の子", parentLabel: "親ノード", hidden: true },
  { nodeId: 30, label: "ルート", parentLabel: null, hidden: false },
  { nodeId: 40, label: "非表示ルート", parentLabel: null, hidden: true },
  { nodeId: 50, label: "とても長いラベル", parentLabel: "別の親", hidden: false },
];

type HarnessProps = {
  initialQuery?: string;
  resultMatches?: readonly NodeSearchListItem[];
  total?: number;
  onQueryChange?: jest.Mock;
  onSelectResult?: jest.Mock;
};

function Harness({
  initialQuery = "",
  resultMatches = matches,
  total = resultMatches.length,
  onQueryChange = jest.fn(),
  onSelectResult = jest.fn(),
}: HarnessProps) {
  const [query, setQuery] = useState(initialQuery);
  const changeQuery = (nextQuery: string) => {
    onQueryChange(nextQuery);
    setQuery(nextQuery);
  };

  return (
    <NodeSearchBox
      query={query}
      onQueryChange={changeQuery}
      hasQuery={query.trim() !== ""}
      matches={resultMatches}
      total={total}
      onSelectResult={onSelectResult}
    />
  );
}

describe("NodeSearchBox", () => {
  let scrollIntoView: jest.Mock;

  beforeEach(() => {
    scrollIntoView = jest.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
  });

  afterEach(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("検索語の入力で名前付き一覧を開き、comboboxの関係を示す", async () => {
    const user = userEvent.setup();
    const onQueryChange = jest.fn();
    render(<Harness onQueryChange={onQueryChange} />);
    const input = screen.getByRole("combobox", { name: "ノードを検索" });

    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("aria-label", "ノードを検索");
    expect(input).toHaveAttribute("placeholder", "ノードを検索");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("spellcheck", "false");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).not.toHaveAttribute("aria-activedescendant");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await user.type(input, "親");

    const listbox = screen.getByRole("listbox", { name: "ノード検索結果" });
    expect(onQueryChange).toHaveBeenCalledWith("親");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", listbox.id);
  });

  it("候補の親・ルート・非表示を表示し、アクセシブルネームで区別する", () => {
    render(<Harness initialQuery="ノード" />);

    const visibleChild = screen.getByRole("option", { name: "親あり（親: 親ノード）" });
    const hiddenChild = screen.getByRole("option", { name: "非表示の子（親: 親ノード、非表示）" });
    expect(within(visibleChild).getByText("親: 親ノード")).toBeInTheDocument();
    expect(within(hiddenChild).getByText(/親: 親ノード.*非表示/)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "ルート（ルート）" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "非表示ルート（ルート、非表示）" })).toBeInTheDocument();
    expect(screen.getByText("とても長いラベル")).toHaveAttribute("title", "とても長いラベル");
  });

  it.each([
    [[], 0, "一致するノードはありません。"],
    [matches.slice(0, 2), 120, "全120件中2件を表示しています。キーワードを絞り込んでください。"],
    [matches, 5, "5件"],
  ] as const)("検索状態を一覧の外へ表示する", (resultMatches, total, status) => {
    render(<Harness initialQuery="検索" resultMatches={resultMatches} total={total} />);

    const statusElement = screen.getByRole("status");
    expect(statusElement).toHaveTextContent(status);
    expect(statusElement).not.toHaveClass("sr-only");
    expect(statusElement).toBeVisible();
    expect(statusElement.parentElement).not.toHaveAttribute("role", "listbox");
    if (resultMatches.length === 0) {
      expect(screen.getByRole("combobox")).not.toHaveAttribute("aria-activedescendant");
    }
  });

  it("開いた直後は先頭を選び、矢印キーで循環する", () => {
    render(<Harness initialQuery="検索" />);
    const input = screen.getByRole("combobox");
    const options = screen.getAllByRole("option");

    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);
    expect(fireEvent.keyDown(input, { key: "ArrowUp" })).toBe(false);
    expect(options[4]).toHaveAttribute("aria-selected", "true");
    expect(fireEvent.keyDown(input, { key: "ArrowDown" })).toBe(false);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("EnterでIDを選択し、一覧と入力フォーカスを保つ", () => {
    const onSelectResult = jest.fn();
    render(<Harness initialQuery="検索" onSelectResult={onSelectResult} />);
    const input = screen.getByRole("combobox");
    input.focus();

    expect(fireEvent.keyDown(input, { key: "ArrowDown" })).toBe(false);
    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(false);

    expect(onSelectResult).toHaveBeenCalledTimes(1);
    expect(onSelectResult).toHaveBeenCalledWith(20);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it("リピート・0件・閉じた一覧・IME変換中のEnterでは選択しない", () => {
    const onSelectResult = jest.fn();
    const { rerender } = render(<Harness initialQuery="検索" onSelectResult={onSelectResult} />);
    let input = screen.getByRole("combobox");
    expect(fireEvent.keyDown(input, { key: "Enter", repeat: true })).toBe(true);
    expect(fireEvent.keyDown(input, { key: "Enter", isComposing: true })).toBe(true);
    expect(fireEvent.keyDown(input, { key: "Enter", keyCode: 229 })).toBe(true);

    rerender(<Harness initialQuery="検索" resultMatches={[]} onSelectResult={onSelectResult} />);
    input = screen.getByRole("combobox");
    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(false);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(false);
    expect(onSelectResult).not.toHaveBeenCalled();
  });

  it("Escapeで閉じ、再度Escapeで検索語を消し、ArrowDownで開き直す", () => {
    const onQueryChange = jest.fn();
    render(<Harness initialQuery="検索" onQueryChange={onQueryChange} />);
    const input = screen.getByRole("combobox");

    expect(fireEvent.keyDown(input, { key: "Escape", isComposing: true })).toBe(true);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(fireEvent.keyDown(input, { key: "Escape" })).toBe(false);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-activedescendant");
    expect(fireEvent.keyDown(input, { key: "ArrowDown" })).toBe(false);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(fireEvent.keyDown(input, { key: "Escape" })).toBe(false);
    expect(onQueryChange).toHaveBeenCalledWith("");
  });

  it("候補の順序変更後もノードIDで選択を保持し、消えた場合は先頭へ戻る", () => {
    const onSelectResult = jest.fn();
    const { rerender } = render(
      <NodeSearchBox query="検索" onQueryChange={jest.fn()} hasQuery matches={matches} total={5} onSelectResult={onSelectResult} />,
    );
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowDown" });

    const reordered = [matches[2], matches[1], matches[0]];
    rerender(<NodeSearchBox query="検索" onQueryChange={jest.fn()} hasQuery matches={reordered} total={3} onSelectResult={onSelectResult} />);
    expect(screen.getByRole("option", { name: "非表示の子（親: 親ノード、非表示）" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelectResult).toHaveBeenLastCalledWith(20);

    rerender(<NodeSearchBox query="検索" onQueryChange={jest.fn()} hasQuery matches={[matches[2], matches[0]]} total={2} onSelectResult={onSelectResult} />);
    expect(screen.getByRole("option", { name: "ルート（ルート）" })).toHaveAttribute("aria-selected", "true");
  });

  it("候補とcallbackの更新後も現在のIDを最新callbackへ渡し、候補消失後は先頭IDへ戻る", () => {
    const firstOnSelectResult = jest.fn();
    const latestOnSelectResult = jest.fn();
    const fallbackOnSelectResult = jest.fn();
    const { rerender } = render(
      <NodeSearchBox query="検索" onQueryChange={jest.fn()} hasQuery matches={matches} total={5} onSelectResult={firstOnSelectResult} />,
    );
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowDown" });

    rerender(
      <NodeSearchBox query="検索" onQueryChange={jest.fn()} hasQuery matches={[matches[2], matches[1]]} total={2} onSelectResult={latestOnSelectResult} />,
    );
    fireEvent.keyDown(input, { key: "Enter" });

    expect(firstOnSelectResult).not.toHaveBeenCalled();
    expect(latestOnSelectResult).toHaveBeenCalledWith(20);

    rerender(
      <NodeSearchBox query="検索" onQueryChange={jest.fn()} hasQuery matches={[matches[2], matches[0]]} total={2} onSelectResult={fallbackOnSelectResult} />,
    );
    fireEvent.keyDown(input, { key: "Enter" });

    expect(fallbackOnSelectResult).toHaveBeenCalledWith(30);
  });

  it("マウス選択でフォーカスと一覧を保ち、ダブルクリックを2回の選択として扱う", async () => {
    const user = userEvent.setup();
    const onSelectResult = jest.fn();
    render(<Harness initialQuery="検索" onSelectResult={onSelectResult} />);
    const input = screen.getByRole("combobox");
    const option = screen.getByRole("option", { name: "ルート（ルート）" });
    input.focus();

    expect(fireEvent.mouseDown(option)).toBe(false);
    await user.click(option);
    expect(option).toHaveAttribute("aria-selected", "true");
    expect(onSelectResult).toHaveBeenLastCalledWith(30);
    expect(input).toHaveFocus();
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    onSelectResult.mockClear();
    await user.dblClick(option);
    expect(onSelectResult).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("結果パネルの余白を押しても入力フォーカスと一覧を保つ", () => {
    render(<Harness initialQuery="検索" />);
    const input = screen.getByRole("combobox");
    const resultPanel = screen.getByRole("status").parentElement;
    input.focus();

    expect(resultPanel).not.toBeNull();
    expect(fireEvent.mouseDown(resultPanel!)).toBe(false);
    expect(input).toHaveFocus();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("Tabで閉じ、検索語がある入力へ戻ると開く", async () => {
    const user = userEvent.setup();
    render(<><Harness initialQuery="検索" /><button type="button">次</button></>);
    const input = screen.getByRole("combobox");
    const nextButton = screen.getByRole("button", { name: "次" });
    for (const option of screen.getAllByRole("option")) {
      expect(option).toHaveAttribute("tabindex", "-1");
    }
    input.focus();
    await user.tab();
    expect(nextButton).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.click(input);
    expect(input).toHaveFocus();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("scrollIntoViewがない環境でも候補を移動できる", () => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    render(<Harness initialQuery="検索" />);
    expect(() => fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" })).not.toThrow();
  });
});
