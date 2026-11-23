import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { CrossMapSearchDialog } from "@/components/layout/CrossMapSearchDialog";
import type { CrossMapCorpus } from "@/domain/mapLibrary/crossMapCorpus";
import { MAX_CROSS_MAP_SEARCH_RESULTS } from "@/domain/search/crossMapSearch";
import { createTestNode } from "@/testing/createTestNode";

type Props = ComponentProps<typeof CrossMapSearchDialog>;

function createDefaultCorpus(): CrossMapCorpus {
  return {
    readableMaps: [
      {
        mapId: "map-current",
        mapName: "学習ノート",
        isCurrent: true,
        isArchived: false,
        nodes: [
          createTestNode({ id: 1, parentId: null, label: "TypeScript 入門" }),
          createTestNode({
            id: 2,
            parentId: 1,
            label: "型システム",
            note: "詳細な解説: ジェネリクスと型推論のまとめ",
          }),
          createTestNode({
            id: 3,
            parentId: 1,
            label: "テスト方針",
            tags: ["品質管理", "TDD"],
          }),
        ],
      },
      {
        mapId: "map-other",
        mapName: "設計メモ",
        isCurrent: false,
        isArchived: true,
        nodes: [
          createTestNode({
            id: 10,
            parentId: null,
            label: "参考サイト集",
            links: ["https://example.com/typescript-handbook"],
          }),
          createTestNode({
            id: 11,
            parentId: 10,
            label: "参考文献",
            sources: [{ title: "プログラミング TypeScript", page: "p.42" }],
          }),
        ],
      },
    ],
    unreadableMaps: [],
  };
}

function renderDialog(overrides: Partial<Props> = {}) {
  const props: Props = {
    corpus: createDefaultCorpus(),
    storageMode: "persistent",
    onSelectMatch: jest.fn(),
    onClose: jest.fn(),
    onMouseClick: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<CrossMapSearchDialog {...props} />) };
}

describe("CrossMapSearchDialog", () => {
  it("モーダルダイアログとして見出し・検索入力欄を表示し、入力欄に自動フォーカスし、空クエリ案内を role=status に出す", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "全マップ検索" });
    expect(dialog).toHaveAttribute("aria-modal", "true");

    const input = within(dialog).getByLabelText("全マップを検索");
    expect(input).toHaveFocus();
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "キーワードを入力すると全マップからノードを検索できます",
    );
    expect(within(dialog).queryByRole("list")).toBeNull();
    expect(within(dialog).queryByRole("alert")).toBeNull();
  });

  it("入力に応じてリアルタイム検索し、ラベル・メモ・タグ・リンク・出典の一致種別バッジとスニペット・親ラベル・現在バッジを表示する", async () => {
    const user = userEvent.setup();
    renderDialog();

    const input = screen.getByLabelText("全マップを検索");

    // ラベル・リンク・出典にまたがる検索（2 マップ・3 件）
    await user.type(input, "TypeScript");

    expect(screen.getByRole("status")).toHaveTextContent(
      "「TypeScript」に 3 件一致（2 マップ）",
    );

    const list = screen.getByRole("listbox", { name: "検索結果" });
    const items = within(list).getAllByRole("option");
    expect(items).toHaveLength(3);

    // 1 件目: 現在マップ・ラベル一致・ルート（親なし）
    expect(items[0]).toHaveTextContent("学習ノート");
    expect(items[0]).toHaveTextContent("現在");
    expect(items[0]).toHaveTextContent("TypeScript 入門");
    expect(items[0]).toHaveTextContent("ラベル");
    expect(items[0]).not.toHaveTextContent("親:");

    // 2 件目: 他マップ・リンク一致・スニペットあり・アーカイブ印
    expect(items[1]).toHaveTextContent("設計メモ");
    expect(items[1]).toHaveTextContent("アーカイブ");
    expect(items[1]).not.toHaveTextContent("現在");
    expect(items[1]).toHaveTextContent("参考サイト集");
    expect(items[1]).toHaveTextContent("リンク");
    expect(items[1]).toHaveTextContent("https://example.com/typescript-handbook");

    // 3 件目: 他マップ・出典一致・親ラベルあり・スニペットあり
    expect(items[2]).toHaveTextContent("設計メモ");
    expect(items[2]).toHaveTextContent("参考文献");
    expect(items[2]).toHaveTextContent("親: 参考サイト集");
    expect(items[2]).toHaveTextContent("出典");
    expect(items[2]).toHaveTextContent("プログラミング TypeScript");

    // メモ一致
    await user.clear(input);
    await user.type(input, "ジェネリクス");
    const noteItem = within(screen.getByRole("listbox", { name: "検索結果" })).getAllByRole("option")[0];
    expect(noteItem).toHaveTextContent("型システム");
    expect(noteItem).toHaveTextContent("親: TypeScript 入門");
    expect(noteItem).toHaveTextContent("メモ");
    expect(noteItem).toHaveTextContent("ジェネリクスと型推論のまとめ");

    // タグ一致
    await user.clear(input);
    await user.type(input, "品質管理");
    const tagItem = within(screen.getByRole("listbox", { name: "検索結果" })).getAllByRole("option")[0];
    expect(tagItem).toHaveTextContent("テスト方針");
    expect(tagItem).toHaveTextContent("タグ");
    expect(tagItem).toHaveTextContent("品質管理");
  });

  it("一致が 0 件のときは role=status に 0 件案内を表示しリストを出さない", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText("全マップを検索"), "見つからない語句");

    expect(screen.getByRole("status")).toHaveTextContent(
      "「見つからない語句」に一致するノードはありません",
    );
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("combobox", { name: "全マップを検索" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("combobox", { name: "全マップを検索" })).not.toHaveAttribute("aria-activedescendant");
  });

  it("結果行はボタン非入れ子構成で、クリックすると対象マップ ID とノード ID で onSelectMatch を呼ぶ（L-835）", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.type(screen.getByLabelText("全マップを検索"), "TypeScript");

    const items = within(screen.getByRole("listbox", { name: "検索結果" })).getAllByRole("option");
    const secondButton = items[1];
    expect(secondButton.tagName).toBe("BUTTON");
    expect(secondButton.querySelector("button")).toBeNull();

    await user.click(secondButton);
    expect(props.onSelectMatch).toHaveBeenCalledTimes(1);
    expect(props.onSelectMatch).toHaveBeenCalledWith("map-other", 10);
  });

  it("結果が 100 件を超えるときは先頭 100 件を表示し、status に全件数と上限表示を追記する", async () => {
    const user = userEvent.setup();
    const totalCount = MAX_CROSS_MAP_SEARCH_RESULTS + 5;
    const corpus: CrossMapCorpus = {
      readableMaps: [
        {
          mapId: "map-big",
          mapName: "大規模マップ",
          isCurrent: true,
        isArchived: false,
          nodes: Array.from({ length: totalCount }, (_, index) =>
            createTestNode({ id: index + 1, label: `共通キーワード ${index + 1}` }),
          ),
        },
      ],
      unreadableMaps: [],
    };
    renderDialog({ corpus });

    await user.type(screen.getByLabelText("全マップを検索"), "共通キーワード");

    expect(screen.getByRole("status")).toHaveTextContent(
      `「共通キーワード」に ${totalCount} 件一致（1 マップ）（先頭 ${MAX_CROSS_MAP_SEARCH_RESULTS} 件を表示）`,
    );
    expect(
      within(screen.getByRole("listbox", { name: "検索結果" })).getAllByRole("option"),
    ).toHaveLength(MAX_CROSS_MAP_SEARCH_RESULTS);
  });

  it("ArrowDown / ArrowUp でアクティブ行を循環移動し、Enter で選択した結果を通知する", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();
    const input = screen.getByLabelText("全マップを検索");

    await user.type(input, "TypeScript");
    const getButtons = () =>
      within(screen.getByRole("listbox", { name: "検索結果" })).getAllByRole("option");

    // 入力欄は combobox で、結果の listbox を指し、アクティブな option を aria-activedescendant で伝える
    expect(input).toHaveAttribute("role", "combobox");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", screen.getByRole("listbox", { name: "検索結果" }).id);
    expect(getButtons()[0]).toHaveAttribute("aria-selected", "true");
    expect(getButtons()[1]).toHaveAttribute("aria-selected", "false");
    expect(input).toHaveAttribute("aria-activedescendant", getButtons()[0].id);

    // ArrowDown で 2 件目へ
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(getButtons()[1]).toHaveAttribute("aria-selected", "true");
    expect(getButtons()[0]).toHaveAttribute("aria-selected", "false");
    expect(input).toHaveAttribute("aria-activedescendant", getButtons()[1].id);

    // Enter で 2 件目を選択
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onSelectMatch).toHaveBeenLastCalledWith("map-other", 10);

    // ArrowUp 2 回で先頭 → 末尾（3 件目）へ循環
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(getButtons()[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(getButtons()[2]).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", getButtons()[2].id);

    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onSelectMatch).toHaveBeenLastCalledWith("map-other", 11);

    // ArrowDown で末尾（3 件目）→ 先頭へ循環
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(getButtons()[0]).toHaveAttribute("aria-selected", "true");
    expect(getButtons()[2]).toHaveAttribute("aria-selected", "false");
    expect(input).toHaveAttribute("aria-activedescendant", getButtons()[0].id);

    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onSelectMatch).toHaveBeenLastCalledWith("map-current", 1);
  });

  it("検索結果件数が減ったときアクティブインデックスを範囲内へ正規化し、先頭結果を選択できる", async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderDialog();
    const input = screen.getByLabelText("全マップを検索");

    await user.type(input, "TypeScript");
    // 3 件目（index 2）をアクティブにする
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });

    // corpus の一致が 1 件だけに減少
    const shrunkCorpus: CrossMapCorpus = {
      readableMaps: [
        {
          mapId: "map-current",
          mapName: "学習ノート",
          isCurrent: true,
        isArchived: false,
          nodes: [createTestNode({ id: 1, label: "TypeScript 入門" })],
        },
      ],
      unreadableMaps: [],
    };
    rerender(<CrossMapSearchDialog {...props} corpus={shrunkCorpus} />);

    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onSelectMatch).toHaveBeenLastCalledWith("map-current", 1);

    // 再度 3 件に戻っても古い index 2 は復活せず先頭（index 0）を維持する
    rerender(<CrossMapSearchDialog {...props} corpus={createDefaultCorpus()} />);
    const buttons = within(screen.getByRole("listbox", { name: "検索結果" })).getAllByRole("option");
    expect(buttons[0]).toHaveAttribute("aria-selected", "true");
    expect(buttons[2]).toHaveAttribute("aria-selected", "false");
  });

  it.each([
    ["isComposing が真", { isComposing: true }],
    ["keyCode が 229", { keyCode: 229 }],
  ])("IME 変換中（%s）は ArrowDown・ArrowUp・Enter・Escape を処理しない（L-474）", async (_name, init) => {
    const user = userEvent.setup();
    const { props } = renderDialog();
    const input = screen.getByLabelText("全マップを検索");

    await user.type(input, "TypeScript");

    fireEvent.keyDown(input, { key: "ArrowDown", ...init });
    fireEvent.keyDown(input, { key: "Enter", ...init });
    fireEvent.keyDown(input, { key: "Escape", ...init });

    expect(props.onSelectMatch).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
    const firstButton = within(screen.getByRole("listbox", { name: "検索結果" })).getAllByRole("option")[0];
    expect(firstButton).toHaveAttribute("aria-selected", "true");
  });

  it("repeat の Enter や repeat の Escape を抑止する（L-408）", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();
    const input = screen.getByLabelText("全マップを検索");

    await user.type(input, "TypeScript");

    fireEvent.keyDown(input, { key: "Enter", repeat: true });
    fireEvent.keyDown(input, { key: "Escape", repeat: true });

    expect(props.onSelectMatch).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("Escape キーと「閉じる」ボタンで onClose を呼ぶ", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    fireEvent.keyDown(screen.getByLabelText("全マップを検索"), { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "閉じる" }));
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it("保護モード時のみ現在マップ限定検索の案内バナーを表示する（L-002・L-061）", () => {
    const { props, rerender } = renderDialog({ storageMode: "protected" });

    expect(
      screen.getByText("保護モードのため現在開いているマップのみ検索しています"),
    ).toBeInTheDocument();

    rerender(<CrossMapSearchDialog {...props} storageMode="persistent" />);
    expect(
      screen.queryByText("保護モードのため現在開いているマップのみ検索しています"),
    ).toBeNull();
  });

  it("unreadableMaps があるときは role=alert で読み取れなかったマップ名を列挙する（L-002）", () => {
    const corpus: CrossMapCorpus = {
      ...createDefaultCorpus(),
      unreadableMaps: [
        { mapId: "map-bad-1", mapName: "破損マップA", reason: "corrupt" },
        { mapId: "map-bad-2", mapName: "読込失敗マップB", reason: "read-error" },
      ],
    };
    renderDialog({ corpus });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("破損マップA");
    expect(alert).toHaveTextContent("読込失敗マップB");
  });

  it("マウスクリックを onMouseClick で通知し、ダブルクリック 2 回目は抑止し、detail 0 では通知しない（L-408）", () => {
    const { props } = renderDialog();
    const closeButton = screen.getByRole("button", { name: "閉じる" });

    fireEvent.click(closeButton, { detail: 1 });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onMouseClick).toHaveBeenCalledTimes(1);

    fireEvent.click(closeButton, { detail: 2 });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onMouseClick).toHaveBeenCalledTimes(2);

    fireEvent.click(closeButton, { detail: 0 });
    expect(props.onClose).toHaveBeenCalledTimes(2);
    expect(props.onMouseClick).toHaveBeenCalledTimes(2);
  });
});
