import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { PartsLibraryDialog } from "@/components/layout/PartsLibraryDialog";
import { createTestNode } from "@/testing/createTestNode";
import type { Part } from "@/domain/parts/partsModel";

type Props = ComponentProps<typeof PartsLibraryDialog>;

function samplePart(overrides: Partial<Part> = {}): Part {
  return {
    id: "part-1",
    name: "議事メモ",
    createdAt: "2026-11-22T00:00:00.000Z",
    nodes: [createTestNode({ id: 1, parentId: null, label: "根" })],
    ...overrides,
  };
}

function setup(overrides: Partial<Props> = {}) {
  const props: Props = {
    mode: "insert",
    parts: [samplePart(), samplePart({ id: "part-2", name: "別部品" })],
    canInsertChild: true,
    onCancel: jest.fn(),
    onRegister: jest.fn(),
    onInsert: jest.fn(),
    onDelete: jest.fn(),
    onMouseClick: jest.fn(),
    ...overrides,
  };
  render(<PartsLibraryDialog {...props} />);
  return props;
}

describe("PartsLibraryDialog", () => {
  it("部品が空のときは「部品がありません」を出し確定できない", () => {
    setup({ mode: "delete", parts: [] });

    expect(screen.getByRole("option", { name: "部品がありません" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "削除" })).toBeDisabled();
  });

  it("canInsertChild が false のとき子挿入は無効でルートにフォールバックする", async () => {
    const user = userEvent.setup();
    const props = setup({ mode: "insert", canInsertChild: false });

    const child = screen.getByRole("radio", { name: /選択ノードの子として/ });
    expect(child).toBeDisabled();
    expect(screen.getByText("（ノードを 1 つ選ぶと有効）")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "新しいルートとして" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "挿入" }));
    expect(props.onInsert).toHaveBeenCalledWith("part-1", "root");
  });

  it("削除モードで選択した部品を削除できる", async () => {
    const user = userEvent.setup();
    const props = setup({ mode: "delete" });

    fireEvent.change(screen.getByLabelText("部品"), { target: { value: "part-2" } });
    expect(within(screen.getByLabelText("部品")).getByRole("option", { name: "別部品" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "削除" }));
    expect(props.onDelete).toHaveBeenCalledWith("part-2");
    expect(props.onInsert).not.toHaveBeenCalled();
  });
});
