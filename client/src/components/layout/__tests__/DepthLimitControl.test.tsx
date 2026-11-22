import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DepthLimitControl } from "@/components/layout/DepthLimitControl";

describe("DepthLimitControl", () => {
  it("深さ制限を名前付きラベル付きセレクトとして提供する", () => {
    render(<DepthLimitControl maxDepth={null} onChange={jest.fn()} />);

    expect(screen.getByLabelText("深さ")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "深さ" })).toHaveValue("unlimited");
  });

  it("現在の maxDepth を選択状態として示す", () => {
    render(<DepthLimitControl maxDepth={2} onChange={jest.fn()} />);

    expect(screen.getByRole("combobox", { name: "深さ" })).toHaveValue("2");
  });

  it.each([
    ["無制限", null],
    ["0（ルート）", 0],
    ["1", 1],
    ["2", 2],
    ["3", 3],
  ] as const)("%s を選ぶと onChange に通知する", async (label, expected) => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<DepthLimitControl maxDepth={null} onChange={onChange} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "深さ" }), label);

    expect(onChange).toHaveBeenCalledWith(expected);
  });
});
