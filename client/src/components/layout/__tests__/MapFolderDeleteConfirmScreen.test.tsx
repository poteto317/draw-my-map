import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MapFolderDeleteConfirmScreen } from "@/components/layout/MapFolderDeleteConfirmScreen";
import type { MapFolder } from "@/domain/mapLibrary/mapLibraryMeta";

function makeFolder(id: string, name: string): MapFolder {
  return {
    id,
    name,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

describe("MapFolderDeleteConfirmScreen", () => {
  it("未分類になる旨を明記し、キャンセル先頭・repeat Enter/IME/detail>1 を抑止する（L-408）", () => {
    const cancelButtonRef = createRef<HTMLButtonElement>();
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    render(
      <MapFolderDeleteConfirmScreen
        headingId="delete-heading"
        descriptionId="delete-desc"
        target={makeFolder("f1", "仕事")}
        mapCount={2}
        disabled={false}
        cancelButtonRef={cancelButtonRef}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(document.getElementById("delete-desc")).toHaveTextContent(
      "中のマップは削除されず『未分類』になります",
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("キャンセル");
    expect(cancelButtonRef.current).toBe(buttons[0]);

    const confirmButton = screen.getByRole("button", { name: "このフォルダーを削除" });
    for (const keyEvent of [
      { key: "Enter", repeat: true },
      { key: " ", repeat: true },
      { key: "Enter", isComposing: true },
      { key: "Enter", keyCode: 229 },
    ]) {
      expect(fireEvent.keyDown(confirmButton, keyEvent)).toBe(false);
      expect(fireEvent.keyDown(buttons[0], keyEvent)).toBe(false);
    }

    fireEvent.click(confirmButton, { detail: 2 });
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(confirmButton, { detail: 1 });
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(buttons[0], { detail: 1 });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disabled 時は「このフォルダーを削除」を無効化し、「キャンセル」は有効のままにする（L-061）", () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    render(
      <MapFolderDeleteConfirmScreen
        headingId="delete-heading"
        descriptionId="delete-desc"
        target={makeFolder("f1", "仕事")}
        mapCount={2}
        disabled={true}
        cancelButtonRef={createRef<HTMLButtonElement>()}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    const confirmButton = screen.getByRole("button", { name: "このフォルダーを削除" });
    const cancelButton = screen.getByRole("button", { name: "キャンセル" });
    expect(confirmButton).toBeDisabled();
    expect(cancelButton).toBeEnabled();

    fireEvent.click(confirmButton, { detail: 1 });
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(cancelButton, { detail: 1 });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
