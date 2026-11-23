import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { NodeAppearanceSection } from "@/components/layout/NodeAppearanceSection";
import type { NodeKind } from "@/types/nodeKind";

type Props = ComponentProps<typeof NodeAppearanceSection>;

function renderSection(overrides: Partial<Props> = {}) {
  const props: Props = {
    visible: true,
    disabled: false,
    icon: undefined,
    kind: undefined,
    onIconChange: jest.fn(),
    onKindChange: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<NodeAppearanceSection {...props} />) };
}

describe("NodeAppearanceSection", () => {
  it("節名「見た目」と日本語の種別ラベルを出す", () => {
    renderSection();

    expect(screen.getByRole("heading", { name: "見た目" })).toBeInTheDocument();
    const kindGroup = screen.getByRole("radiogroup", { name: "種別" });
    expect(within(kindGroup).getByRole("radio", { name: "なし" })).toBeChecked();
    expect(within(kindGroup).getByRole("radio", { name: "疑問" })).toBeInTheDocument();
    expect(within(kindGroup).getByRole("radio", { name: "結論" })).toBeInTheDocument();
    expect(within(kindGroup).getByRole("radio", { name: "根拠" })).toBeInTheDocument();
    expect(within(kindGroup).getByRole("radio", { name: "アイデア" })).toBeInTheDocument();
  });

  it("visible が false なら節を描画しない", () => {
    renderSection({ visible: false });

    expect(screen.queryByRole("heading", { name: "見た目" })).not.toBeInTheDocument();
  });

  it("disabled なら入力・クリア・種別・チップを無効化する", () => {
    renderSection({ disabled: true, icon: "🔥", kind: "question" });

    expect(screen.getByRole("textbox", { name: "アイコン" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "アイコンをクリア" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "アイコンを設定" })).toBeDisabled();
    for (const name of ["なし", "疑問", "結論", "根拠", "アイデア"] as const) {
      expect(screen.getByRole("radio", { name })).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: "アイコン 🔥" })).toBeDisabled();
  });

  it("iconError をアラートとして表示する", () => {
    renderSection({ iconError: "絵文字を1つだけ入力してください" });

    expect(screen.getByRole("alert")).toHaveTextContent("絵文字を1つだけ入力してください");
  });

  it("クリアで onIconChange(undefined) を呼ぶ", async () => {
    const user = userEvent.setup();
    const onIconChange = jest.fn();
    renderSection({ icon: "🔥", onIconChange });

    await user.click(screen.getByRole("button", { name: "アイコンをクリア" }));

    expect(onIconChange).toHaveBeenCalledWith(undefined);
  });

  it("受理できる絵文字チップで onIconChange を呼ぶ", async () => {
    const user = userEvent.setup();
    const onIconChange = jest.fn();
    renderSection({ onIconChange });

    await user.click(screen.getByRole("button", { name: "アイコン 💡" }));

    expect(onIconChange).toHaveBeenCalledWith("💡");
  });

  it("不正なアイコン入力はエラー表示のみで onIconChange しない", async () => {
    const user = userEvent.setup();
    const onIconChange = jest.fn();
    renderSection({ onIconChange });

    await user.type(screen.getByRole("textbox", { name: "アイコン" }), "A");
    await user.click(screen.getByRole("button", { name: "アイコンを設定" }));

    expect(onIconChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("絵文字を1つだけ入力してください");
  });

  it.each([
    ["疑問", "question"],
    ["結論", "conclusion"],
    ["根拠", "evidence"],
    ["アイデア", "idea"],
  ] as const)("%sを選ぶと onKindChange(%s)", async (label, kind: NodeKind) => {
    const user = userEvent.setup();
    const onKindChange = jest.fn();
    renderSection({ onKindChange });

    await user.click(screen.getByRole("radio", { name: label }));

    expect(onKindChange).toHaveBeenCalledWith(kind);
  });

  it("なしを選ぶと onKindChange(undefined)", async () => {
    const user = userEvent.setup();
    const onKindChange = jest.fn();
    renderSection({ kind: "idea", onKindChange });

    await user.click(screen.getByRole("radio", { name: "なし" }));

    expect(onKindChange).toHaveBeenCalledWith(undefined);
  });
});
