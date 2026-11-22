import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodePinControls } from "@/components/layout/NodePinControls";
import { createTestNode } from "@/testing/createTestNode";

describe("NodePinControls", () => {
  const nodes = [
    createTestNode({ id: 1, parentId: null, label: "根ノード" }),
    createTestNode({ id: 2, parentId: 1, label: "子ノード" }),
  ];
  const pins = [
    { nodeId: 1, createdAt: "2026-11-22T00:00:00.000Z" },
    { nodeId: 2, createdAt: "2026-11-22T01:00:00.000Z" },
  ];

  it("登録ボタンとピン一覧を提供する", () => {
    render(
      <NodePinControls
        pins={pins}
        nodes={nodes}
        canRegister
        onRegister={jest.fn()}
        onJump={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    expect(screen.getByRole("group", { name: "ノードピン" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ピン" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "根ノードへジャンプ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "子ノードのピンを削除" })).toBeInTheDocument();
  });

  it("canRegister が false のとき登録ボタンを無効にする", () => {
    render(
      <NodePinControls
        pins={[]}
        nodes={nodes}
        canRegister={false}
        onRegister={jest.fn()}
        onJump={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "ピン" })).toBeDisabled();
  });

  it("ジャンプと削除を通知する", async () => {
    const user = userEvent.setup();
    const onJump = jest.fn();
    const onDelete = jest.fn();
    const onRegister = jest.fn();
    render(
      <NodePinControls
        pins={pins}
        nodes={nodes}
        canRegister
        onRegister={onRegister}
        onJump={onJump}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByRole("button", { name: "ピン" }));
    expect(onRegister).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "根ノードへジャンプ" }));
    expect(onJump).toHaveBeenCalledWith(1);

    await user.click(screen.getByRole("button", { name: "子ノードのピンを削除" }));
    expect(onDelete).toHaveBeenCalledWith(2);
  });
});
