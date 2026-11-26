import { fireEvent, render, screen } from "@testing-library/react";
import { NodeTaskSection } from "@/components/layout/NodeTaskSection";
import { NODE_TAG_INPUT_MAX_LENGTH } from "@/domain/nodes/nodeTag";

it("完了・期限・担当者を入力中には書き込まず一括保存する", () => {
  const commitTask = jest.fn(() => ({ ok: true as const, changed: true }));
  render(<NodeTaskSection target={{ nodeId: 1, documentRevision: 0 }} task={{ completed: false }}
    disabled={false} commitTask={commitTask} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "完了" }));
  fireEvent.change(screen.getByLabelText("期限"), { target: { value: "2026-12-04" } });
  fireEvent.change(screen.getByLabelText("担当者"), { target: { value: "山田" } });
  fireEvent.blur(screen.getByLabelText("担当者"));
  expect(commitTask).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "タスクを保存" }));
  expect(commitTask).toHaveBeenCalledWith({ nodeId: 1, documentRevision: 0 }, { completed: false },
    { completed: true, dueDate: "2026-12-04", assignee: "山田" });
});

it("担当者入力欄に NODE_TAG_INPUT_MAX_LENGTH を付ける", () => {
  render(<NodeTaskSection target={{ nodeId: 1, documentRevision: 0 }} task={{ completed: false }}
    disabled={false} commitTask={jest.fn(() => ({ ok: true as const, changed: false }))} />);
  expect(screen.getByLabelText("担当者")).toHaveAttribute("maxLength", String(NODE_TAG_INPUT_MAX_LENGTH));
});

it("読み取り専用に切り替わると未保存の入力を破棄する", () => {
  const props = { target: { nodeId: 1, documentRevision: 0 }, task: { completed: false, assignee: "保存値" },
    commitTask: jest.fn(() => ({ ok: true as const, changed: false })) };
  const { rerender } = render(<NodeTaskSection {...props} disabled={false} />);
  fireEvent.change(screen.getByLabelText("担当者"), { target: { value: "下書き" } });
  rerender(<NodeTaskSection {...props} disabled />);
  expect(screen.getByLabelText("担当者")).toHaveValue("保存値");
  expect(screen.getByRole("button", { name: "タスクを保存" })).toBeDisabled();
  expect(props.commitTask).not.toHaveBeenCalled();
});
