import { fireEvent, render, screen } from "@testing-library/react";
import Home from "@/app/page";
import type { NodeLayoutMode } from "@/types/nodeLayout";

jest.mock("@/components/layout/AppHeader", () => ({
  AppHeader: ({
    layoutMode,
    onLayoutModeChange,
  }: {
    layoutMode: NodeLayoutMode;
    onLayoutModeChange: (mode: NodeLayoutMode) => void;
  }) => (
    <header>
      <output data-testid="layout-mode">{layoutMode}</output>
      <button type="button" onClick={() => onLayoutModeChange("auto")}>
        自動配置へ変更
      </button>
    </header>
  ),
}));

jest.mock("@/components/map/MapStage", () => ({
  MapStage: () => <div data-testid="map-stage" />,
}));

describe("Home", () => {
  describe("配置モード配線", () => {
    it("配置モードと変更commandをヘッダーへ接続する", () => {
      render(<Home />);

      expect(screen.getByTestId("layout-mode")).toHaveTextContent("manual");

      fireEvent.click(screen.getByRole("button", { name: "自動配置へ変更" }));

      expect(screen.getByTestId("layout-mode")).toHaveTextContent("auto");
    });
  });

  describe("レイアウト", () => {
    it("可変高headerを除いたviewport内の残領域をmapへ割り当てる", () => {
      render(<Home />);
      const main = screen.getByTestId("map-stage").closest("main")!;
      const shell = main.parentElement!;

      expect(shell).toHaveClass("h-dvh");
      expect(shell).not.toHaveClass("overflow-hidden");
      expect(main).toHaveClass("min-h-0", "flex-1", "overflow-hidden");
    });
  });
});
