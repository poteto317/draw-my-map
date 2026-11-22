import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HighlightModeControl } from "@/components/layout/HighlightModeControl";

describe("HighlightModeControl", () => {
  it("一時強調を名前付きラベル付きセレクトとして提供する", () => {
    render(<HighlightModeControl mode="off" onChange={jest.fn()} />);

    expect(screen.getByLabelText("一時強調")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "一時強調" })).toHaveValue("off");
  });

  it("現在の mode を選択状態として示す", () => {
    render(<HighlightModeControl mode="search" onChange={jest.fn()} />);

    expect(screen.getByRole("combobox", { name: "一時強調" })).toHaveValue("search");
  });

  it.each([
    ["オフ", "off"],
    ["検索ヒット", "search"],
    ["選択枝", "selection"],
  ] as const)("%s を選ぶと onChange に通知する", async (label, expected) => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<HighlightModeControl mode="off" onChange={onChange} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "一時強調" }), label);

    expect(onChange).toHaveBeenCalledWith(expected);
  });
});
