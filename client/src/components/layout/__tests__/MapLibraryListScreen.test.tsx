process.env.TZ = "Asia/Tokyo";

import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MapLibraryListScreen } from "@/components/layout/MapLibraryListScreen";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import { createEmptyMapLibraryMeta, type MapLibraryMetaV1 } from "@/domain/mapLibrary/mapLibraryMeta";

type Props = Parameters<typeof MapLibraryListScreen>[0];

const maps: MapIndexEntry[] = [
  {
    id: "b",
    name: "旅行の計画",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-21T03:00:00.000Z",
  },
  {
    id: "a",
    name: "旅行の計画",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-20T01:05:00.000Z",
  },
  {
    id: "c",
    name: "読書メモ",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-19T00:00:00.000Z",
  },
];

function renderList(overrides: Partial<Props> = {}) {
  const props: Props = {
    headingId: "map-library-heading",
    maps,
    currentMapId: "a",
    libraryMeta: createEmptyMapLibraryMeta(),
    libraryMetaStatus: "ready",
    listTab: "all",
    folderFilter: { kind: "all" },
    onChangeListTab: jest.fn(),
    onChangeFolderFilter: jest.fn(),
    onOpenFolders: jest.fn(),
    onToggleFavorite: jest.fn(),
    onAssignFolder: jest.fn(),
    onResetLibraryMeta: jest.fn(),
    onOpenCreate: jest.fn(),
    onClose: jest.fn(),
    onSwitch: jest.fn(),
    onOpenRename: jest.fn(),
    onOpenDelete: jest.fn(),
    onPrepareBackup: jest.fn(),
    onSelectRestoreFile: jest.fn(),
    trashCount: 0,
    trashStatus: "ok",
    onOpenTrash: jest.fn(),
    onOpenBrokenLinks: jest.fn(),
    storageMode: "persistent",
    ...overrides,
  };
  render(<MapLibraryListScreen {...props} />);
  return props;
}

function rows() {
  return within(screen.getByRole("list", { name: "保存済みのマップ" })).getAllByRole(
    "listitem",
  );
}

describe("MapLibraryListScreen", () => {
  it("同じファイルを続けて選べ、毎回復元の読込を開始する", async () => {
    const user = userEvent.setup();
    const props = renderList();
    const file = new File(["{}"], "backup.json", { type: "application/json" });
    const input = screen.getByLabelText("バックアップファイル", { selector: "input" }) as HTMLInputElement;
    expect(input).toHaveAttribute("accept", ".json,application/json");
    await user.upload(input, file);
    expect(props.onSelectRestoreFile).toHaveBeenCalledWith(file);
    expect(input.value).toBe("");
    await user.upload(input, file);
    expect(props.onSelectRestoreFile).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "全マップをバックアップ" }));
    expect(props.onPrepareBackup).toHaveBeenCalledTimes(1);
  });

  it("保護モードはバックアップと復元を拒否し、JSON書き出しへ案内する", async () => {
    const user = userEvent.setup();
    const props = renderList({ storageMode: "protected" });
    await user.click(screen.getByRole("button", { name: "全マップをバックアップ" }));
    await user.click(screen.getByRole("button", { name: "バックアップから復元" }));
    expect(props.onPrepareBackup).not.toHaveBeenCalled();
    expect(props.onSelectRestoreFile).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("JSON書き出し");
  });
  it("見出し・新しいマップ・閉じるのボタンを表示する", () => {
    renderList();

    const heading = screen.getByRole("heading", { name: "マップ一覧" });
    expect(heading).toHaveAttribute("id", "map-library-heading");
    expect(screen.getByRole("button", { name: "新しいマップ" })).toHaveAttribute(
      "data-map-action",
      "create",
    );
    expect(screen.getByRole("button", { name: "閉じる" })).toBeInTheDocument();
  });

  it("渡された表示順のとおりに行を並べ、同じ名前の行を更新日時で見分けられる", () => {
    renderList();

    const items = rows();
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("旅行の計画");
    expect(items[0]).toHaveTextContent("更新: 2026/10/21 12:00");
    expect(items[1]).toHaveTextContent("旅行の計画");
    expect(items[1]).toHaveTextContent("更新: 2026/10/20 10:05");
    expect(items[2]).toHaveTextContent("読書メモ");
    expect(items[2]).toHaveTextContent("更新: 2026/10/19 09:00");
  });

  it("開いているマップの行だけに aria-current と「（開いています）」を付ける", () => {
    renderList();

    const openButtons = rows().map((item) =>
      item.querySelector('[data-map-action="open"]'),
    );
    expect(openButtons[0]).not.toHaveAttribute("aria-current");
    expect(openButtons[1]).toHaveAttribute("aria-current", "true");
    expect(openButtons[1]).toHaveTextContent("（開いています）");
    expect(openButtons[0]).not.toHaveTextContent("（開いています）");
    expect(openButtons[2]).not.toHaveTextContent("（開いています）");
  });

  it("各ボタンの名前が見える文字を先頭に含む", () => {
    renderList();

    const [, second] = rows();
    const scoped = within(second);
    const openButton = scoped.getByRole("button", { name: /^旅行の計画/ });
    expect(openButton).toHaveAttribute("data-map-id", "a");
    expect(openButton).toHaveAttribute("data-map-action", "open");

    const rename = scoped.getByRole("button", { name: "名前を変更: 旅行の計画" });
    expect(rename).toHaveTextContent(/^名前を変更$/);
    expect(rename).toHaveAttribute("data-map-id", "a");
    expect(rename).toHaveAttribute("data-map-action", "rename");

    const remove = scoped.getByRole("button", { name: "削除: 旅行の計画" });
    expect(remove).toHaveTextContent(/^削除$/);
    expect(remove).toHaveAttribute("data-map-id", "a");
    expect(remove).toHaveAttribute("data-map-action", "delete");
  });

  it("各行のボタンがその行の id をコールバックへ渡す", async () => {
    const user = userEvent.setup();
    const props = renderList();
    const [first, , third] = rows();

    await user.click(within(third).getByRole("button", { name: /^読書メモ/ }));
    await user.click(within(first).getByRole("button", { name: "名前を変更: 旅行の計画" }));
    await user.click(within(third).getByRole("button", { name: "削除: 読書メモ" }));

    expect(props.onSwitch).toHaveBeenCalledTimes(1);
    expect(props.onSwitch).toHaveBeenCalledWith("c");
    expect(props.onOpenRename).toHaveBeenCalledTimes(1);
    expect(props.onOpenRename).toHaveBeenCalledWith("b");
    expect(props.onOpenDelete).toHaveBeenCalledTimes(1);
    expect(props.onOpenDelete).toHaveBeenCalledWith("c");
  });

  it("新しいマップと閉じるのボタンがコールバックを呼ぶ", async () => {
    const user = userEvent.setup();
    const props = renderList();

    await user.click(screen.getByRole("button", { name: "新しいマップ" }));
    await user.click(screen.getByRole("button", { name: "閉じる" }));

    expect(props.onOpenCreate).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("ゴミ箱ボタンを件数・破損状態に応じて表示し、通常操作で onOpenTrash を呼ぶ", async () => {
    const user = userEvent.setup();
    const emptyProps = renderList({ trashCount: 0, trashStatus: "ok" });
    const emptyTrashButton = screen.getByRole("button", { name: "ゴミ箱" });
    expect(emptyTrashButton).toHaveAttribute("data-map-library-action", "trash");
    await user.click(emptyTrashButton);
    expect(emptyProps.onOpenTrash).toHaveBeenCalledTimes(1);

    const { rerender } = render(
      <MapLibraryListScreen {...emptyProps} trashCount={3} trashStatus="ok" />,
    );
    expect(screen.getAllByRole("button", { name: "ゴミ箱（3）" })[0]).toHaveAttribute(
      "data-map-library-action",
      "trash",
    );

    rerender(
      <MapLibraryListScreen {...emptyProps} trashCount={0} trashStatus="corrupt" />,
    );
    expect(screen.getAllByRole("button", { name: "ゴミ箱（要確認）" })[0]).toHaveAttribute(
      "data-map-library-action",
      "trash",
    );
  });

  it("ゴミ箱ボタンは保護モードでは拒否し、repeat/IME/detail>1 を抑止する", () => {
    const protectedProps = renderList({ storageMode: "protected" });
    const protectedTrash = screen.getByRole("button", { name: "ゴミ箱" });
    fireEvent.click(protectedTrash, { detail: 1 });
    expect(protectedProps.onOpenTrash).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("JSON書き出し");

    const normalProps = renderList({ trashCount: 1 });
    const buttons = screen.getAllByRole("button", { name: /^ゴミ箱/ });
    const normalTrash = buttons[buttons.length - 1];
    for (const keyEvent of [
      { key: "Enter", repeat: true },
      { key: " ", repeat: true },
      { key: "Enter", isComposing: true },
      { key: "Enter", keyCode: 229 },
    ]) {
      expect(fireEvent.keyDown(normalTrash, keyEvent)).toBe(false);
    }
    fireEvent.click(normalTrash, { detail: 2 });
    expect(normalProps.onOpenTrash).not.toHaveBeenCalled();
    fireEvent.click(normalTrash, { detail: 1 });
    expect(normalProps.onOpenTrash).toHaveBeenCalledTimes(1);
  });

  it("お気に入りボタンはマップを開くボタンと入れ子にせず（L-835）、トグル・バッジ・フォルダー割当を操作できる", async () => {
    const user = userEvent.setup();
    const meta: MapLibraryMetaV1 = {
      version: 1,
      folders: [
        {
          id: "f1",
          name: "仕事",
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-10-01T00:00:00.000Z",
        },
        {
          id: "f2",
          name: "読書",
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-10-01T00:00:00.000Z",
        },
      ],
      mapMeta: {
        b: { favorite: true, folderId: "f1" },
        c: { lastOpenedAt: "2026-10-22T00:30:00.000Z" },
      },
    };
    const props = renderList({ libraryMeta: meta });

    const [firstRow, , thirdRow] = rows();
    const openB = within(firstRow).getByRole("button", { name: /^旅行の計画/ });
    const favB = within(firstRow).getByRole("button", { name: "お気に入り: 旅行の計画" });
    expect(openB).not.toContainElement(favB);
    expect(favB).not.toContainElement(openB);
    // 名前は状態によらず固定し、状態は aria-pressed だけで伝える（重要度・表示の切り替えボタンと同じ慣行）
    expect(favB).toHaveAttribute("aria-pressed", "true");
    expect(favB).toHaveTextContent("★");
    expect(openB).toHaveTextContent("仕事");

    const favC = within(thirdRow).getByRole("button", { name: "お気に入り: 読書メモ" });
    expect(favC).toHaveAttribute("aria-pressed", "false");
    expect(favC).toHaveTextContent("☆");

    await user.click(favB);
    expect(props.onToggleFavorite).toHaveBeenCalledWith("b");

    const folderSelect = within(thirdRow).getByRole("combobox", { name: "読書メモのフォルダー" });
    expect(folderSelect).toHaveValue("");
    await user.selectOptions(folderSelect, "f2");
    expect(props.onAssignFolder).toHaveBeenCalledWith("c", "f2");

    const folderSelectB = within(firstRow).getByRole("combobox", { name: "旅行の計画のフォルダー" });
    expect(folderSelectB).toHaveValue("f1");
    await user.selectOptions(folderSelectB, "");
    expect(props.onAssignFolder).toHaveBeenCalledWith("b", null);
  });

  it("フォルダーの選択欄は長いフォルダー名でもダイアログの幅を超えない（max-w-full・min-w-0、絞り込みは truncate）", () => {
    const longName = "長".repeat(50);
    const meta: MapLibraryMetaV1 = {
      version: 1,
      folders: [
        {
          id: "f1",
          name: longName,
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-10-01T00:00:00.000Z",
        },
      ],
      mapMeta: { c: { folderId: "f1" } },
    };
    renderList({ libraryMeta: meta });

    const rowSelect = screen.getByRole("combobox", { name: "読書メモのフォルダー" });
    expect(rowSelect).toHaveClass("max-w-full", "min-w-0");
    const filterSelect = screen.getByRole("combobox", { name: "フォルダーで絞り込み" });
    expect(filterSelect).toHaveClass("max-w-full", "min-w-0", "truncate");
  });

  it("表示切替タブ・フォルダー絞り込み・最近使用タブのボタン外最終閲覧日時・0件空状態を表示する", async () => {
    const user = userEvent.setup();
    const meta: MapLibraryMetaV1 = {
      version: 1,
      folders: [
        {
          id: "f1",
          name: "仕事",
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-10-01T00:00:00.000Z",
        },
      ],
      mapMeta: {
        c: { lastOpenedAt: "2026-10-22T01:15:00.000Z", folderId: "f1" },
      },
    };
    const props = renderList({
      libraryMeta: meta,
      listTab: "recent",
      folderFilter: { kind: "all" },
    });

    expect(screen.getByRole("button", { name: "すべて" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "お気に入り" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "最近使用" })).toHaveAttribute("aria-pressed", "true");

    const items = rows();
    expect(items).toHaveLength(1);
    const openBtn = within(items[0]).getByRole("button", { name: /^読書メモ/ });
    expect(openBtn).not.toHaveTextContent("最終閲覧:");
    expect(items[0]).toHaveTextContent("最終閲覧: 2026/10/22 10:15");

    await user.click(screen.getByRole("button", { name: "お気に入り" }));
    expect(props.onChangeListTab).toHaveBeenCalledWith("favorites");

    const filterSelect = screen.getByRole("combobox", { name: "フォルダーで絞り込み" });
    await user.selectOptions(filterSelect, "folder:f1");
    expect(props.onChangeFolderFilter).toHaveBeenCalledWith({ kind: "folder", folderId: "f1" });
    await user.selectOptions(filterSelect, "unclassified");
    expect(props.onChangeFolderFilter).toHaveBeenCalledWith({ kind: "unclassified" });

    renderList({ libraryMeta: meta, listTab: "favorites", folderFilter: { kind: "all" } });
    expect(screen.getByText("該当するマップはありません")).toBeInTheDocument();
  });

  it("corrupt 時は初期化ボタン付き alert、unavailable（非保護）時は初期化ボタンなし alert、非ready/保護時は書込UIを disabled にする（L-002, L-057, L-061）", async () => {
    const user = userEvent.setup();
    const corruptProps = renderList({ libraryMetaStatus: "corrupt" });
    expect(screen.getByRole("alert")).toHaveTextContent("破損");
    const resetBtn = screen.getByRole("button", { name: "メタデータを初期化" });
    expect(screen.getByRole("button", { name: "フォルダー管理" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "お気に入り: 読書メモ" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "読書メモのフォルダー" })).toBeDisabled();
    await user.click(resetBtn);
    expect(corruptProps.onResetLibraryMeta).toHaveBeenCalledTimes(1);

    const { unmount } = render(
      <MapLibraryListScreen {...corruptProps} libraryMetaStatus="unavailable" storageMode="persistent" />,
    );
    expect(screen.getAllByRole("alert").some((el) => el.textContent?.includes("読み込めませんでした"))).toBe(true);
    unmount();

    const { container } = render(
      <MapLibraryListScreen {...corruptProps} libraryMetaStatus="unavailable" storageMode="persistent" />,
    );
    expect(within(container).queryByRole("button", { name: "メタデータを初期化" })).not.toBeInTheDocument();
    expect(within(container).getByRole("button", { name: "フォルダー管理" })).toBeDisabled();
  });

  it("孤立 folderId は未分類として選択値を表示し、メタデータ初期化の detail>1 と不正フォルダー絞り込み値をガードする", () => {
    const orphanMeta: MapLibraryMetaV1 = {
      version: 1,
      folders: [],
      mapMeta: {
        b: { folderId: "orphan-folder" },
      },
    };
    const props = renderList({
      libraryMeta: orphanMeta,
      libraryMetaStatus: "corrupt",
    });

    const [firstRow] = rows();
    expect(within(firstRow).getByRole("combobox", { name: "旅行の計画のフォルダー" })).toHaveValue("");

    const resetBtn = screen.getByRole("button", { name: "メタデータを初期化" });
    fireEvent.click(resetBtn, { detail: 2 });
    expect(props.onResetLibraryMeta).not.toHaveBeenCalled();
    fireEvent.click(resetBtn, { detail: 1 });
    expect(props.onResetLibraryMeta).toHaveBeenCalledTimes(1);

    const filterSelect = screen.getByRole("combobox", { name: "フォルダーで絞り込み" });
    const badOption = document.createElement("option");
    badOption.value = "folder:invalid id!";
    filterSelect.appendChild(badOption);
    fireEvent.change(filterSelect, { target: { value: "folder:invalid id!" } });
    expect(props.onChangeFolderFilter).toHaveBeenCalledWith({ kind: "all" });
  });

  it("リンク切れを確認ボタンは通常クリックで onOpenBrokenLinks を呼び、保護モード・repeat/IME・detail>1 を抑止する", () => {
    const protectedProps = renderList({ storageMode: "protected" });
    const protectedButton = screen.getByRole("button", { name: "リンク切れを確認" });
    expect(protectedButton).toHaveAttribute("data-map-library-action", "brokenLinks");
    fireEvent.click(protectedButton, { detail: 1 });
    expect(protectedProps.onOpenBrokenLinks).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("JSON書き出し");

    const normalProps = renderList();
    const buttons = screen.getAllByRole("button", { name: "リンク切れを確認" });
    const normalButton = buttons[buttons.length - 1];
    for (const keyEvent of [
      { key: "Enter", repeat: true },
      { key: " ", repeat: true },
      { key: "Enter", isComposing: true },
      { key: "Enter", keyCode: 229 },
    ]) {
      expect(fireEvent.keyDown(normalButton, keyEvent)).toBe(false);
    }
    fireEvent.click(normalButton, { detail: 2 });
    expect(normalProps.onOpenBrokenLinks).not.toHaveBeenCalled();
    fireEvent.click(normalButton, { detail: 1 });
    expect(normalProps.onOpenBrokenLinks).toHaveBeenCalledTimes(1);
  });
});
