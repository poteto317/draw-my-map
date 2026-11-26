import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeCustomAttributesSection } from "@/components/layout/NodeCustomAttributesSection";
import type { CommitCustomAttribute } from "@/hooks/useNodeTaskAttributeEditing";
import { formatCustomAttributeFailure } from "@/domain/nodes/nodeCustomAttributeUpdate";
import { MAX_CUSTOM_OPTIONS } from "@/domain/nodes/nodeTaskAttributes";
import { NODE_TAG_INPUT_MAX_LENGTH, nodeTagKey } from "@/domain/nodes/nodeTag";

const target = { nodeId: 1, documentRevision: 0 };

function renderSection(overrides: Partial<Parameters<typeof NodeCustomAttributesSection>[0]> = {}) {
  const commitCustomAttribute = jest.fn<ReturnType<CommitCustomAttribute>, Parameters<CommitCustomAttribute>>(
    () => ({ ok: true, changed: true }),
  );
  const getAttributeGeneration = jest.fn(() => 0);
  render(
    <NodeCustomAttributesSection
      target={target}
      customAttributes={undefined}
      disabled={false}
      commitCustomAttribute={commitCustomAttribute}
      getAttributeGeneration={getAttributeGeneration}
      {...overrides}
    />,
  );
  return { commitCustomAttribute, getAttributeGeneration };
}

it("名前入力欄に NODE_TAG_INPUT_MAX_LENGTH を付ける", async () => {
  const user = userEvent.setup();
  renderSection();
  await user.click(screen.getByRole("button", { name: "属性を追加" }));
  expect(screen.getByLabelText("名前")).toHaveAttribute("maxLength", String(NODE_TAG_INPUT_MAX_LENGTH));
});

it("数値属性を追加すると commitCustomAttribute が呼ばれる", async () => {
  const user = userEvent.setup();
  const { commitCustomAttribute } = renderSection();
  await user.click(screen.getByRole("button", { name: "属性を追加" }));
  await user.selectOptions(screen.getByLabelText("種類"), "number");
  await user.type(screen.getByLabelText("名前"), "件数");
  await user.type(screen.getByLabelText("数値"), "12");
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(commitCustomAttribute).toHaveBeenCalledWith(
    target,
    null,
    null,
    { name: "件数", type: "number", value: 12 },
    undefined,
  );
});

it("選択肢の末尾改行1つを受理する", async () => {
  const user = userEvent.setup();
  const { commitCustomAttribute } = renderSection();
  await user.click(screen.getByRole("button", { name: "属性を追加" }));
  await user.selectOptions(screen.getByLabelText("種類"), "choice");
  await user.type(screen.getByLabelText("名前"), "区分");
  fireEvent.change(screen.getByLabelText("候補"), { target: { value: "高\n中\n" } });
  await user.selectOptions(screen.getByLabelText("値"), "高");
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(commitCustomAttribute).toHaveBeenCalledWith(
    target,
    null,
    null,
    expect.objectContaining({ type: "choice", options: ["高", "中"], value: "高" }),
    undefined,
  );
});

it("削除は表示時の世代を commit に渡す", () => {
  const commitCustomAttribute = jest.fn(() => ({ ok: true as const, changed: true }));
  const original = { name: "件数", type: "number" as const, value: 1 };
  renderSection({
    customAttributes: [original],
    commitCustomAttribute,
    getAttributeGeneration: () => 2,
  });
  fireEvent.click(screen.getByRole("button", { name: "カスタム属性を削除: 件数" }));
  expect(commitCustomAttribute).toHaveBeenCalledWith(
    target,
    nodeTagKey("件数"),
    original,
    null,
    2,
  );
});

it("日付属性を追加すると commitCustomAttribute が呼ばれる", async () => {
  const user = userEvent.setup();
  const { commitCustomAttribute } = renderSection();
  await user.click(screen.getByRole("button", { name: "属性を追加" }));
  await user.selectOptions(screen.getByLabelText("種類"), "date");
  await user.type(screen.getByLabelText("名前"), "期限");
  fireEvent.change(screen.getByLabelText("日付"), { target: { value: "2026-12-01" } });
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(commitCustomAttribute).toHaveBeenCalledWith(
    target,
    null,
    null,
    { name: "期限", type: "date", value: "2026-12-01" },
    undefined,
  );
});

it("候補の改名で値が未選択になり、保存拒否のあと再選択して保存できる", async () => {
  const user = userEvent.setup();
  const existing = { name: "区分", type: "choice" as const, options: ["高", "中"], value: "高" };
  const { commitCustomAttribute } = renderSection({ customAttributes: [existing] });
  await user.click(screen.getByRole("button", { name: "編集: 区分" }));
  fireEvent.change(screen.getByLabelText("候補"), { target: { value: "高め\n中\n" } });
  expect(screen.getByLabelText("値")).toHaveValue("");
  await user.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => {
    expect(screen.getByRole("alert")).toHaveTextContent("値を選択してください。");
  });
  expect(commitCustomAttribute).not.toHaveBeenCalled();
  await user.selectOptions(screen.getByLabelText("値"), "高め");
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(commitCustomAttribute).toHaveBeenCalledWith(
    target,
    nodeTagKey("区分"),
    existing,
    { name: "区分", type: "choice", options: ["高め", "中"], value: "高め" },
    undefined,
  );
});

it("候補から選択中の値を削除すると未選択になり、保存拒否のあと再選択して保存できる", async () => {
  const user = userEvent.setup();
  const existing = { name: "区分", type: "choice" as const, options: ["高", "中"], value: "高" };
  const { commitCustomAttribute } = renderSection({ customAttributes: [existing] });
  await user.click(screen.getByRole("button", { name: "編集: 区分" }));
  fireEvent.change(screen.getByLabelText("候補"), { target: { value: "中\n" } });
  expect(screen.getByLabelText("値")).toHaveValue("");
  await user.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => {
    expect(screen.getByRole("alert")).toHaveTextContent("値を選択してください。");
  });
  expect(commitCustomAttribute).not.toHaveBeenCalled();
  await user.selectOptions(screen.getByLabelText("値"), "中");
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(commitCustomAttribute).toHaveBeenCalledWith(
    target,
    nodeTagKey("区分"),
    existing,
    { name: "区分", type: "choice", options: ["中"], value: "中" },
    undefined,
  );
});

it("documentRevision が変わると下書きとエラーを消す", async () => {
  const user = userEvent.setup();
  const props = { target: { nodeId: 1, documentRevision: 0 }, disabled: false as const };
  const { rerender } = render(
    <NodeCustomAttributesSection
      {...props}
      customAttributes={undefined}
      commitCustomAttribute={jest.fn(() => ({ ok: true, changed: true }))}
      getAttributeGeneration={() => 0}
    />,
  );
  await user.click(screen.getByRole("button", { name: "属性を追加" }));
  await user.type(screen.getByLabelText("名前"), "下書き");
  rerender(
    <NodeCustomAttributesSection
      {...props}
      target={{ nodeId: 1, documentRevision: 1 }}
      customAttributes={undefined}
      commitCustomAttribute={jest.fn(() => ({ ok: true, changed: true }))}
      getAttributeGeneration={() => 0}
    />,
  );
  expect(screen.getByRole("button", { name: "属性を追加" })).toBeInTheDocument();
  expect(screen.queryByLabelText("名前")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("読み取り専用に切り替わると未保存の下書きとエラーを破棄する", async () => {
  const user = userEvent.setup();
  const commitCustomAttribute = jest.fn(() => ({ ok: false as const, reason: "同じエラー" }));
  const props = {
    target,
    customAttributes: undefined,
    commitCustomAttribute,
    getAttributeGeneration: () => 0,
  };
  const { rerender } = render(<NodeCustomAttributesSection {...props} disabled={false} />);
  await user.click(screen.getByRole("button", { name: "属性を追加" }));
  await user.type(screen.getByLabelText("名前"), "件数");
  await user.type(screen.getByLabelText("数値"), "1");
  await user.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => {
    expect(screen.getByRole("alert")).toHaveTextContent("同じエラー");
  });
  rerender(<NodeCustomAttributesSection {...props} disabled />);
  expect(screen.getByRole("button", { name: "属性を追加" })).toBeDisabled();
  expect(screen.queryByLabelText("名前")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("同一エラーは再送信ごとに読み上げられる", async () => {
  const commitCustomAttribute = jest.fn(() => ({ ok: false as const, reason: "同じエラー" }));
  renderSection({ commitCustomAttribute });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "属性を追加" }));
  await user.selectOptions(screen.getByLabelText("種類"), "number");
  await user.type(screen.getByLabelText("名前"), "件数");
  await user.type(screen.getByLabelText("数値"), "1");
  await user.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => {
    expect(screen.getByRole("alert")).toHaveTextContent("同じエラー");
  });
  await user.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => {
    expect(screen.getByRole("alert")).toHaveTextContent("同じエラー");
  });
});

it("候補が上限を超えると保存前にエラーを出す", async () => {
  const user = userEvent.setup();
  renderSection();
  await user.click(screen.getByRole("button", { name: "属性を追加" }));
  await user.selectOptions(screen.getByLabelText("種類"), "choice");
  const tooMany = Array.from({ length: MAX_CUSTOM_OPTIONS + 1 }, (_, index) => `候補${index}`).join("\n");
  fireEvent.change(screen.getByLabelText("候補"), { target: { value: tooMany } });
  await waitFor(() => {
    expect(screen.getByRole("alert")).toHaveTextContent(formatCustomAttributeFailure("too-many-options"));
  });
});

it("バリデーションエラー時に入力へ aria-invalid を付与する", async () => {
  const user = userEvent.setup();
  renderSection();
  await user.click(screen.getByRole("button", { name: "属性を追加" }));
  await user.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => {
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
  expect(screen.getByLabelText("名前")).toHaveAttribute("aria-invalid", "true");
});