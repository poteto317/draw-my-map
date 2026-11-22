import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DepthLimitEmptyHint } from "@/components/layout/DepthLimitEmptyHint";

describe("DepthLimitEmptyHint", () => {
  it("無制限へ戻す導線を提供する", async () => {
    const user = userEvent.setup();
    const onResetToUnlimited = jest.fn();
    render(<DepthLimitEmptyHint onResetToUnlimited={onResetToUnlimited} />);

    expect(screen.getByRole("status", { name: "深さ制限の表示案内" })).toHaveTextContent(
      "深さ制限により表示できるノードがありません。",
    );
    await user.click(screen.getByRole("button", { name: "深さを無制限に戻す" }));
    expect(onResetToUnlimited).toHaveBeenCalledTimes(1);
  });
});
