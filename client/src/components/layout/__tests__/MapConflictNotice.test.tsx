import { fireEvent, render, screen, within } from "@testing-library/react";
import { MapConflictNotice } from "@/components/layout/MapConflictNotice";
import {
  CONFLICT_NOTICE_MESSAGE,
  EXTERNALLY_DELETED_NOTICE_MESSAGE,
  EXTERNAL_UPDATE_NOTICE_MESSAGE,
  EXPORT_JSON_BUTTON_LABEL,
  RELOAD_EXTERNAL_BUTTON_LABEL,
  RELOAD_EXTERNAL_CONTENT_BUTTON_LABEL,
  SAVE_AS_COPY_BUTTON_LABEL,
} from "@/domain/mapLibrary/mapConflictMessages";

describe("MapConflictNotice", () => {
  it("conflictState が none のときは role=alert ライブリージョンを常設しつつ中身は空にする（知見 L-153）", () => {
    const { container } = render(<MapConflictNotice conflictState="none" />);

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveAttribute("aria-atomic", "true");
    expect(alert).toHaveClass("sr-only");
    expect(alert).toBeEmptyDOMElement();
    expect(container.textContent).toBe("");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("conflict 状態のときは警告文をライブリージョンに投入し3つのアクションボタンを表示してコールバックを発火する", () => {
    const onSaveAsCopy = jest.fn();
    const onReloadExternal = jest.fn();
    const onExportJson = jest.fn();

    render(
      <MapConflictNotice
        conflictState="conflict"
        onSaveAsCopy={onSaveAsCopy}
        onReloadExternal={onReloadExternal}
        onExportJson={onExportJson}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(CONFLICT_NOTICE_MESSAGE);

    const saveAsCopyBtn = screen.getByRole("button", { name: SAVE_AS_COPY_BUTTON_LABEL });
    const reloadBtn = screen.getByRole("button", { name: RELOAD_EXTERNAL_BUTTON_LABEL });
    const exportJsonBtn = screen.getByRole("button", { name: EXPORT_JSON_BUTTON_LABEL });

    fireEvent.click(saveAsCopyBtn);
    expect(onSaveAsCopy).toHaveBeenCalledTimes(1);

    fireEvent.click(reloadBtn);
    expect(onReloadExternal).toHaveBeenCalledTimes(1);

    fireEvent.click(exportJsonBtn);
    expect(onExportJson).toHaveBeenCalledTimes(1);
  });

  it("externallyDeleted 状態のときは削除警告文と別名保存・JSON書き出しボタンを表示し最新読込は出さない", () => {
    const onSaveAsCopy = jest.fn();
    const onExportJson = jest.fn();

    render(
      <MapConflictNotice
        conflictState="externallyDeleted"
        onSaveAsCopy={onSaveAsCopy}
        onExportJson={onExportJson}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(EXTERNALLY_DELETED_NOTICE_MESSAGE);
    expect(screen.getByRole("button", { name: SAVE_AS_COPY_BUTTON_LABEL })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: EXPORT_JSON_BUTTON_LABEL })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: RELOAD_EXTERNAL_BUTTON_LABEL })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: RELOAD_EXTERNAL_CONTENT_BUTTON_LABEL })).not.toBeInTheDocument();
  });

  it("externalUpdate 状態のときは更新文と最新の内容を読み込むボタンのみを表示する", () => {
    const onReloadExternal = jest.fn();

    render(
      <MapConflictNotice
        conflictState="externalUpdate"
        onReloadExternal={onReloadExternal}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(EXTERNAL_UPDATE_NOTICE_MESSAGE);
    const reloadContentBtn = screen.getByRole("button", { name: RELOAD_EXTERNAL_CONTENT_BUTTON_LABEL });
    expect(reloadContentBtn).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SAVE_AS_COPY_BUTTON_LABEL })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: EXPORT_JSON_BUTTON_LABEL })).not.toBeInTheDocument();

    fireEvent.click(reloadContentBtn);
    expect(onReloadExternal).toHaveBeenCalledTimes(1);
  });

  it("ボタン群はライブリージョン（role=alert）の外側に配置される（L-153）", () => {
    render(
      <MapConflictNotice
        conflictState="conflict"
        onSaveAsCopy={jest.fn()}
        onReloadExternal={jest.fn()}
        onExportJson={jest.fn()}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(CONFLICT_NOTICE_MESSAGE);
    expect(within(alert).queryAllByRole("button")).toHaveLength(0);
  });
});
