import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LockControls } from "@/components/layout/LockControls";

describe("LockControls", () => {
  it("メニューを開くとロック操作を表示する", async () => {
    const user = userEvent.setup();
    render(
      <LockControls
        selectionActive
        nodeLocked={false}
        onToggleLock={jest.fn()}
        onLockSubtree={jest.fn()}
        onUnlockSubtree={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "編集ロック" }));

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "ロックする" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "枝をロック" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "枝のロックを解除" })).toBeInTheDocument();
  });

  it("選択ノードがロック中のときトグル表示を切り替える", async () => {
    const user = userEvent.setup();
    render(
      <LockControls
        selectionActive
        nodeLocked
        onToggleLock={jest.fn()}
        onLockSubtree={jest.fn()}
        onUnlockSubtree={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "編集ロック" }));

    expect(screen.getByRole("menuitem", { name: "ロックを解除" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "ロックする" })).not.toBeInTheDocument();
  });

  it("単一選択トグルで onToggleLock を呼ぶ", async () => {
    const user = userEvent.setup();
    const onToggleLock = jest.fn();
    render(
      <LockControls
        selectionActive
        nodeLocked={false}
        onToggleLock={onToggleLock}
        onLockSubtree={jest.fn()}
        onUnlockSubtree={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "編集ロック" }));
    await user.click(screen.getByRole("menuitem", { name: "ロックする" }));

    expect(onToggleLock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("枝をロックは onLockSubtree を一度だけ呼ぶ（1 Undo の単一操作）", async () => {
    const user = userEvent.setup();
    const onLockSubtree = jest.fn();
    render(
      <LockControls
        selectionActive
        nodeLocked={false}
        onToggleLock={jest.fn()}
        onLockSubtree={onLockSubtree}
        onUnlockSubtree={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "編集ロック" }));
    await user.click(screen.getByRole("menuitem", { name: "枝をロック" }));

    expect(onLockSubtree).toHaveBeenCalledTimes(1);
  });

  it("選択がないときは無効化する", () => {
    const { container } = render(
      <LockControls
        selectionActive={false}
        nodeLocked={false}
        onToggleLock={jest.fn()}
        onLockSubtree={jest.fn()}
        onUnlockSubtree={jest.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "編集ロック" })).toBeDisabled();
    expect(container.firstChild).toHaveAttribute(
      "title",
      "ノードを1件だけ選択してください。",
    );
  });

  it("選択が消えると開いていたメニューを閉じる（L-214）", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <LockControls
        selectionActive
        nodeLocked={false}
        onToggleLock={jest.fn()}
        onLockSubtree={jest.fn()}
        onUnlockSubtree={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "編集ロック" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    rerender(
      <LockControls
        selectionActive={false}
        nodeLocked={false}
        onToggleLock={jest.fn()}
        onLockSubtree={jest.fn()}
        onUnlockSubtree={jest.fn()}
      />,
    );

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "編集ロック" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});