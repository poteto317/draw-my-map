import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

jest.mock("@/components/layout/AppHeader", () => ({
  AppHeader: () => <header>Header</header>,
}));

jest.mock("@/components/map/MapStage", () => ({
  MapStage: () => <div data-testid="map-stage" />,
}));

describe("Home layout", () => {
  it("可変高headerを除いたviewport内の残領域をmapへ割り当てる", () => {
    render(<Home />);
    const main = screen.getByTestId("map-stage").closest("main")!;
    const shell = main.parentElement!;

    expect(shell).toHaveClass("h-dvh");
    expect(shell).not.toHaveClass("overflow-hidden");
    expect(main).toHaveClass("min-h-0", "flex-1", "overflow-hidden");
  });
});
