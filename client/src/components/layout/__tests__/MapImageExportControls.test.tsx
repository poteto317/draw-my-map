import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MapImageExportControls } from "@/components/layout/MapImageExportControls";

describe("MapImageExportControls", () => {
  it("PNG・SVG書き出しcommandを対応するボタンから実行する", async () => {
    const user = userEvent.setup();
    const onExportPng = jest.fn();
    const onExportSvg = jest.fn();
    render(
      <MapImageExportControls
        onExportPng={onExportPng}
        onExportSvg={onExportSvg}
        isExportingPng={false}
      />,
    );

    const pngButton = screen.getByRole("button", { name: "PNG書き出し" });
    const svgButton = screen.getByRole("button", { name: "SVG書き出し" });
    expect(pngButton).toHaveAttribute("type", "button");
    expect(svgButton).toHaveAttribute("type", "button");

    await user.click(pngButton);
    await user.click(svgButton);

    expect(onExportPng).toHaveBeenCalledTimes(1);
    expect(onExportSvg).toHaveBeenCalledTimes(1);
  });

  it("PNG処理中はPNG書き出しだけを無効化する", () => {
    render(
      <MapImageExportControls
        onExportPng={jest.fn()}
        onExportSvg={jest.fn()}
        isExportingPng
      />,
    );

    expect(screen.getByRole("button", { name: "PNG書き出し" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "SVG書き出し" })).toBeEnabled();
  });
});
