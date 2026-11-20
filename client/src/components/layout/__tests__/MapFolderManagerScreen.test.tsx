import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MapFolderManagerScreen } from "@/components/layout/MapFolderManagerScreen";
import { MAX_MAP_FOLDERS, type MapFolder } from "@/domain/mapLibrary/mapLibraryMeta";

function makeFolder(id: string, name: string): MapFolder {
  return {
    id,
    name,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

describe("MapFolderManagerScreen", () => {
  it("見出し・空状態・戻るボタンを表示し、フォルダー一覧と所属マップ数を描画する", async () => {
    const user = userEvent.setup();
    const onOpenRename = jest.fn();
    const onOpenDelete = jest.fn();
    const onBackToList = jest.fn();

    const { rerender } = render(
      <MapFolderManagerScreen
        headingId="folder-heading"
        folders={[]}
        mapCountByFolderId={new Map()}
        disabled={false}
        onCreateFolder={jest.fn(() => true)}
        onOpenRename={onOpenRename}
        onOpenDelete={onOpenDelete}
        onBackToList={onBackToList}
      />,
    );

    expect(screen.getByRole("heading", { name: "フォルダー管理" })).toHaveAttribute(
      "id",
      "folder-heading",
    );
    expect(screen.getByText("フォルダーはまだありません。")).toBeInTheDocument();

    const folders = [makeFolder("f1", "仕事"), makeFolder("f2", "読書")];
    rerender(
      <MapFolderManagerScreen
        headingId="folder-heading"
        folders={folders}
        mapCountByFolderId={new Map([["f1", 3]])}
        disabled={false}
        onCreateFolder={jest.fn(() => true)}
        onOpenRename={onOpenRename}
        onOpenDelete={onOpenDelete}
        onBackToList={onBackToList}
      />,
    );

    const list = screen.getByRole("list", { name: "登録済みのフォルダー" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("仕事");
    expect(items[0]).toHaveTextContent("3 件");
    expect(items[1]).toHaveTextContent("読書");
    expect(items[1]).toHaveTextContent("0 件");

    const renameBtn = within(items[0]).getByRole("button", { name: "名前を変更: 仕事" });
    const deleteBtn = within(items[1]).getByRole("button", { name: "削除: 読書" });
    expect(renameBtn).toHaveAttribute("data-folder-id", "f1");
    expect(renameBtn).toHaveAttribute("data-folder-action", "rename");
    expect(deleteBtn).toHaveAttribute("data-folder-id", "f2");
    expect(deleteBtn).toHaveAttribute("data-folder-action", "delete");

    await user.click(renameBtn);
    await user.click(deleteBtn);
    await user.click(screen.getByRole("button", { name: "マップ一覧に戻る" }));

    expect(onOpenRename).toHaveBeenCalledWith("f1");
    expect(onOpenDelete).toHaveBeenCalledWith("f2");
    expect(onBackToList).toHaveBeenCalledTimes(1);
  });

  it("フォルダー作成の成功時に入力をクリアし、失敗時は入力値を保持する（L-001）", async () => {
    const user = userEvent.setup();
    const onCreateFolder = jest
      .fn<boolean, [string]>()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    render(
      <MapFolderManagerScreen
        headingId="folder-heading"
        folders={[]}
        mapCountByFolderId={new Map()}
        disabled={false}
        onCreateFolder={onCreateFolder}
        onOpenRename={jest.fn()}
        onOpenDelete={jest.fn()}
        onBackToList={jest.fn()}
      />,
    );

    const input = screen.getByRole("textbox", { name: "新しいフォルダー名" });
    expect(input).toHaveAttribute("data-folder-action", "create");

    await user.type(input, "企画");
    await user.click(screen.getByRole("button", { name: "作成" }));
    expect(onCreateFolder).toHaveBeenCalledWith("企画");
    expect(input).toHaveValue("企画");

    await user.click(screen.getByRole("button", { name: "作成" }));
    expect(onCreateFolder).toHaveBeenCalledTimes(2);
    expect(input).toHaveValue("");
  });

  it("上限の案内のライブリージョンは常に描画し、49 件から 50 件になると同じ要素の中身だけが変わる", () => {
    const folders = (count: number) =>
      Array.from({ length: count }, (_, index) => makeFolder(`f${index}`, `フォルダ${index}`));
    const renderScreen = (count: number) => (
      <MapFolderManagerScreen
        headingId="folder-heading"
        folders={folders(count)}
        mapCountByFolderId={new Map()}
        disabled={false}
        onCreateFolder={jest.fn(() => true)}
        onOpenRename={jest.fn()}
        onOpenDelete={jest.fn()}
        onBackToList={jest.fn()}
      />
    );

    const { rerender } = render(renderScreen(MAX_MAP_FOLDERS - 1));
    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();

    rerender(renderScreen(MAX_MAP_FOLDERS));
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent(`フォルダーは上限（${MAX_MAP_FOLDERS} 件）に達しています。`);
  });

  it("空欄・重複・上限50件を検証し、上限時は role=status で案内する", async () => {
    const user = userEvent.setup();
    const onCreateFolder = jest.fn(() => true);
    const fullFolders = Array.from({ length: MAX_MAP_FOLDERS }, (_, index) =>
      makeFolder(`f${index}`, `フォルダ${index}`),
    );

    const { rerender } = render(
      <MapFolderManagerScreen
        headingId="folder-heading"
        folders={[makeFolder("f1", "仕事")]}
        mapCountByFolderId={new Map()}
        disabled={false}
        onCreateFolder={onCreateFolder}
        onOpenRename={jest.fn()}
        onOpenDelete={jest.fn()}
        onBackToList={jest.fn()}
      />,
    );

    const input = screen.getByRole("textbox", { name: "新しいフォルダー名" });
    await user.click(screen.getByRole("button", { name: "作成" }));
    expect(screen.getByRole("alert")).toHaveTextContent("フォルダー名を入力してください。");
    expect(onCreateFolder).not.toHaveBeenCalled();

    await user.type(input, "仕事");
    await user.click(screen.getByRole("button", { name: "作成" }));
    expect(screen.getByRole("alert")).toHaveTextContent("同じ名前のフォルダーがすでに存在します。");
    expect(onCreateFolder).not.toHaveBeenCalled();

    rerender(
      <MapFolderManagerScreen
        headingId="folder-heading"
        folders={fullFolders}
        mapCountByFolderId={new Map()}
        disabled={false}
        onCreateFolder={onCreateFolder}
        onOpenRename={jest.fn()}
        onOpenDelete={jest.fn()}
        onBackToList={jest.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(`${MAX_MAP_FOLDERS}`);
    await user.clear(input);
    await user.type(input, "新規");
    await user.click(screen.getByRole("button", { name: "作成" }));
    expect(screen.getByRole("alert")).toHaveTextContent(`${MAX_MAP_FOLDERS}`);
    expect(onCreateFolder).not.toHaveBeenCalled();
  });

  it("IME変換中・repeat Enter を抑止し、blur では送信しない（L-408, L-473, L-474）", async () => {
    const user = userEvent.setup();
    const onCreateFolder = jest.fn(() => true);

    render(
      <MapFolderManagerScreen
        headingId="folder-heading"
        folders={[]}
        mapCountByFolderId={new Map()}
        disabled={false}
        onCreateFolder={onCreateFolder}
        onOpenRename={jest.fn()}
        onOpenDelete={jest.fn()}
        onBackToList={jest.fn()}
      />,
    );

    const input = screen.getByRole("textbox", { name: "新しいフォルダー名" });
    await user.type(input, "旅行");

    expect(fireEvent.keyDown(input, { key: "Enter", isComposing: true })).toBe(false);
    expect(fireEvent.keyDown(input, { key: "Enter", keyCode: 229 })).toBe(false);
    expect(fireEvent.keyDown(input, { key: "Enter", repeat: true })).toBe(false);
    fireEvent.blur(input);
    expect(onCreateFolder).not.toHaveBeenCalled();

    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(true);
  });

  it("disabled 時は作成・名前変更・削除を無効化する（L-057, L-061）", () => {
    render(
      <MapFolderManagerScreen
        headingId="folder-heading"
        folders={[makeFolder("f1", "仕事")]}
        mapCountByFolderId={new Map()}
        disabled={true}
        onCreateFolder={jest.fn(() => true)}
        onOpenRename={jest.fn()}
        onOpenDelete={jest.fn()}
        onBackToList={jest.fn()}
      />,
    );

    expect(screen.getByRole("textbox", { name: "新しいフォルダー名" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "作成" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "名前を変更: 仕事" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "削除: 仕事" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "マップ一覧に戻る" })).toBeEnabled();
  });
});
