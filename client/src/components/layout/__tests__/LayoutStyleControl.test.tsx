import { fireEvent, render, screen } from "@testing-library/react";
import { LayoutStyleControl } from "@/components/layout/LayoutStyleControl";

describe("LayoutStyleControl", () => {
  it("直交／放射を切り替えられる", () => {
    const onChange = jest.fn();
    render(
      <LayoutStyleControl
        layoutStyle={undefined}
        disabled={false}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("group", { name: "レイアウト様式" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "放射" }));
    expect(onChange).toHaveBeenCalledWith("radial");
  });

  it("disabled のとき操作不可", () => {
    const onChange = jest.fn();
    render(
      <LayoutStyleControl
        layoutStyle="radial"
        disabled
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("button", { name: "直交" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "放射" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "直交" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
