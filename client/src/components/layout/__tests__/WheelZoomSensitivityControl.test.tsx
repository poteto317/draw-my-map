import { fireEvent, render, screen } from "@testing-library/react";
import { WheelZoomSensitivityControl } from "@/components/layout/WheelZoomSensitivityControl";

describe("WheelZoomSensitivityControl", () => {
  it("スライダーと現在値を表示する", () => {
    render(<WheelZoomSensitivityControl value={0.0025} onChange={jest.fn()} />);

    expect(screen.getByLabelText("ズーム感度")).toHaveValue("0.0025");
    expect(screen.getByText("0.0025")).toBeInTheDocument();
    expect(screen.getByText("ズーム感度", { selector: "label" })).toBeVisible();
  });

  it("スライダー変更で onChange を呼ぶ", () => {
    const onChange = jest.fn();
    render(<WheelZoomSensitivityControl value={0.0025} onChange={onChange} />);

    const slider = screen.getByLabelText("ズーム感度");
    fireEvent.change(slider, { target: { value: "0.004" } });

    expect(onChange).toHaveBeenCalledWith(0.004);
  });
});