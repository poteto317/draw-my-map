import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BranchExtractDialog } from "@/components/layout/BranchExtractDialog";

function setup(overrides: Partial<Parameters<typeof BranchExtractDialog>[0]> = {}) {
  const onCancel = jest.fn();
  const onSubmit = jest.fn();
  const onMouseClick = jest.fn();
  render(
    <BranchExtractDialog
      displayLabel="枝A"
      canSubmit
      error={{ sequence: 0, message: null }}
      focusRequest="dialog"
      onFocusRequestApplied={jest.fn()}
      onCancel={onCancel}
      onSubmit={onSubmit}
      onMouseClick={onMouseClick}
      {...overrides}
    />,
  );
  return { onCancel, onSubmit, onMouseClick };
}

describe("BranchExtractDialog", () => {
  it("切り出しを確定するボタンに元に戻せない旨を説明として結ぶ", () => {
    setup();
    expect(screen.getByRole("button", { name: "切り出す" }))
      .toHaveAccessibleDescription("枝の切り出しは元に戻せません。切り出し後に新しいマップを開きます。");
  });

  it("本文にも元に戻せない旨を示す", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "枝を別マップに切り出す" }))
      .toHaveTextContent("元に戻せません");
  });

  it("確定で onSubmit を呼ぶ", async () => {
    const { onSubmit } = setup();
    await userEvent.click(screen.getByRole("button", { name: "切り出す" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});