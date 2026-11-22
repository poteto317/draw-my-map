import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportScopeControl } from "@/components/layout/ExportScopeControl";

describe("ExportScopeControl", () => {
  it("書き出し対象を切り替え、選択不可時は選択を無効化する", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const { rerender } = render(
      <ExportScopeControl
        scope="all"
        onChange={onChange}
        selectionAvailable
      />,
    );

    expect(screen.getByRole("group", { name: "書き出し対象" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "表示中" }));
    expect(onChange).toHaveBeenCalledWith("visible");

    await user.click(screen.getByRole("button", { name: "選択" }));
    expect(onChange).toHaveBeenCalledWith("selection");

    rerender(
      <ExportScopeControl
        scope="all"
        onChange={onChange}
        selectionAvailable={false}
      />,
    );

    const selection = screen.getByRole("button", { name: /選択/ });
    expect(selection).toBeDisabled();
    expect(selection).toHaveAccessibleName(/ノードを1つ選んでください/);
    expect(screen.getByRole("button", { name: "表示中" })).toBeEnabled();
  });
});
