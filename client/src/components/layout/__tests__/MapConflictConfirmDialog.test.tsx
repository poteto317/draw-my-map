import { fireEvent, render, screen } from "@testing-library/react";
import { MapConflictConfirmDialog } from "@/components/layout/MapConflictConfirmDialog";
import {
  RELOAD_CONFIRM_ACTION_LABEL,
  RELOAD_CONFIRM_CANCEL_LABEL,
  RELOAD_CONFIRM_MESSAGE,
  RELOAD_CONFIRM_TITLE,
} from "@/domain/mapLibrary/mapConflictMessages";

describe("MapConflictConfirmDialog", () => {
  it("isOpen が false のときはダイアログを描画しない", () => {
    render(
      <MapConflictConfirmDialog
        isOpen={false}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("isOpen が true のときはダイアログを表示しキャンセルボタンに初期フォーカスを当てる", () => {
    render(
      <MapConflictConfirmDialog
        isOpen={true}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: RELOAD_CONFIRM_TITLE });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(RELOAD_CONFIRM_MESSAGE)).toBeInTheDocument();

    const cancelBtn = screen.getByRole("button", { name: RELOAD_CONFIRM_CANCEL_LABEL });
    const confirmBtn = screen.getByRole("button", { name: RELOAD_CONFIRM_ACTION_LABEL });

    expect(cancelBtn).toHaveFocus();
    expect(confirmBtn).toBeInTheDocument();
  });

  it("キャンセルボタンのクリックで onCancel が呼ばれる", () => {
    const onCancel = jest.fn();
    render(
      <MapConflictConfirmDialog
        isOpen={true}
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: RELOAD_CONFIRM_CANCEL_LABEL }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("確定ボタンのクリックで onConfirm が呼ばれる", () => {
    const onConfirm = jest.fn();
    render(
      <MapConflictConfirmDialog
        isOpen={true}
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: RELOAD_CONFIRM_ACTION_LABEL }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("Escape キー押下で onCancel が呼ばれる", () => {
    const onCancel = jest.fn();
    render(
      <MapConflictConfirmDialog
        isOpen={true}
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />,
    );

    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("Enter キーリピートによる確定ボタンの誤発火を抑止する", () => {
    const onConfirm = jest.fn();
    render(
      <MapConflictConfirmDialog
        isOpen={true}
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />,
    );

    const confirmBtn = screen.getByRole("button", { name: RELOAD_CONFIRM_ACTION_LABEL });
    confirmBtn.focus();

    // repeat: true の keydown
    const prevented = fireEvent.keyDown(confirmBtn, { key: "Enter", repeat: true });
    expect(prevented).toBe(false); // preventDefault が呼ばれたこと
    expect(onConfirm).not.toHaveBeenCalled();

    // 通常のクリック（または repeat: false の keydown）では確定される
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("Space キーリピートによる確定ボタンの誤発火を抑止する", () => {
    const onConfirm = jest.fn();
    render(
      <MapConflictConfirmDialog
        isOpen={true}
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />,
    );

    const confirmBtn = screen.getByRole("button", { name: RELOAD_CONFIRM_ACTION_LABEL });
    confirmBtn.focus();

    const prevented = fireEvent.keyDown(confirmBtn, { key: " ", repeat: true });
    expect(prevented).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("ダイアログをクリックした際に onMouseClick が発火する", () => {
    const onMouseClick = jest.fn();
    render(
      <MapConflictConfirmDialog
        isOpen={true}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
        onMouseClick={onMouseClick}
      />,
    );

    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog, { detail: 1 });
    expect(onMouseClick).toHaveBeenCalledTimes(1);
  });

  it("isOpen が false から true に切り替わった場合でも、初期フォーカス・Escape キー・フォーカストラップが正しく機能する", () => {
    const onCancel = jest.fn();
    const { rerender } = render(
      <MapConflictConfirmDialog
        isOpen={false}
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerender(
      <MapConflictConfirmDialog
        isOpen={true}
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: RELOAD_CONFIRM_TITLE });
    expect(dialog).toBeInTheDocument();

    const cancelBtn = screen.getByRole("button", { name: RELOAD_CONFIRM_CANCEL_LABEL });
    const confirmBtn = screen.getByRole("button", { name: RELOAD_CONFIRM_ACTION_LABEL });

    // 初期フォーカスがキャンセルボタンにあること
    expect(cancelBtn).toHaveFocus();

    // フォーカストラップ: キャンセルボタン(先頭)で Shift+Tab を押すと末尾の確定ボタンに循環
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(confirmBtn).toHaveFocus();

    // 確定ボタン(末尾)で Tab を押すと先頭のキャンセルボタンに循環
    fireEvent.keyDown(window, { key: "Tab" });
    expect(cancelBtn).toHaveFocus();

    // Escape キーで onCancel が呼ばれること
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
