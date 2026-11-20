import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MapFolderRenameScreen } from "@/components/layout/MapFolderRenameScreen";
import type { MapFolder } from "@/domain/mapLibrary/mapLibraryMeta";

function makeFolder(id: string, name: string): MapFolder {
  return {
    id,
    name,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

describe("MapFolderRenameScreen", () => {
  it("初期値を全選択し、重複検証・IME/repeat抑止・blur非確定・送信とキャンセルを扱う（L-408, L-473, L-474）", async () => {
    const user = userEvent.setup();
    const inputRef = createRef<HTMLInputElement>();
    const onSubmit = jest.fn();
    const onCancel = jest.fn();
    const folders = [makeFolder("f1", "仕事"), makeFolder("f2", "読書")];

    render(
      <MapFolderRenameScreen
        headingId="rename-heading"
        target={folders[0]}
        folders={folders}
        disabled={false}
        inputRef={inputRef}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );

    const input = screen.getByRole("textbox", { name: "フォルダー名" }) as HTMLInputElement;
    expect(input).toHaveValue("仕事");
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(2);

    expect(fireEvent.keyDown(input, { key: "Enter", isComposing: true })).toBe(false);
    expect(fireEvent.keyDown(input, { key: "Enter", keyCode: 229 })).toBe(false);
    expect(fireEvent.keyDown(input, { key: "Enter", repeat: true })).toBe(false);
    fireEvent.blur(input);
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, "読書");
    await user.click(screen.getByRole("button", { name: "変更" }));
    expect(screen.getByRole("alert")).toHaveTextContent("同じ名前のフォルダーがすでに存在します。");
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, "研究{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("研究");

    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disabled 時は入力欄と「変更」を無効化し送信をブロックする（「キャンセル」は有効・L-061）", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    const onCancel = jest.fn();
    const folders = [makeFolder("f1", "仕事")];

    render(
      <MapFolderRenameScreen
        headingId="rename-heading"
        target={folders[0]}
        folders={folders}
        disabled={true}
        inputRef={createRef<HTMLInputElement>()}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );

    const input = screen.getByRole("textbox", { name: "フォルダー名" });
    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "変更" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "キャンセル" })).toBeEnabled();

    fireEvent.submit(input.closest("form")!);
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
