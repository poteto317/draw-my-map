import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MapViewportZoomControls } from "@/components/map/MapViewportZoomControls";
import { MAX_VIEWPORT_SCALE, MIN_VIEWPORT_SCALE } from "@/types/viewport";

function renderControls({
  scale = 1,
  onZoomIn = jest.fn(),
  onZoomOut = jest.fn(),
} = {}) {
  render(<MapViewportZoomControls scale={scale} onZoomIn={onZoomIn} onZoomOut={onZoomOut} />);
  return {
    group: screen.getByRole("group", { name: "ズーム" }),
    zoomIn: screen.getByRole("button", { name: "拡大" }),
    zoomOut: screen.getByRole("button", { name: "縮小" }),
    onZoomIn,
    onZoomOut,
  };
}

afterEach(cleanup);

describe("MapViewportZoomControls", () => {
  it("ズームグループと拡大・縮小ボタンを右下に配置する", () => {
    const { group } = renderControls();

    expect(group).toHaveClass("absolute", "bottom-3", "right-3");
  });

  it("拡大ボタンのクリックでonZoomInを呼ぶ", async () => {
    const user = userEvent.setup();
    const { zoomIn, onZoomIn } = renderControls();

    await user.click(zoomIn);

    expect(onZoomIn).toHaveBeenCalledTimes(1);
  });

  it("縮小ボタンのクリックでonZoomOutを呼ぶ", async () => {
    const user = userEvent.setup();
    const { zoomOut, onZoomOut } = renderControls();

    await user.click(zoomOut);

    expect(onZoomOut).toHaveBeenCalledTimes(1);
  });

  it(`scaleが上限${MAX_VIEWPORT_SCALE}なら拡大を無効にする`, () => {
    const { zoomIn } = renderControls({ scale: MAX_VIEWPORT_SCALE });

    expect(zoomIn).toBeDisabled();
  });

  it(`scaleが下限${MIN_VIEWPORT_SCALE}なら縮小を無効にする`, () => {
    const { zoomOut } = renderControls({ scale: MIN_VIEWPORT_SCALE });

    expect(zoomOut).toBeDisabled();
  });

  it("上限scaleでも縮小ボタンは有効のまま", () => {
    const { zoomOut } = renderControls({ scale: MAX_VIEWPORT_SCALE });
    expect(zoomOut).toBeEnabled();
  });

  it("下限scaleでも拡大ボタンは有効のまま", () => {
    const { zoomIn } = renderControls({ scale: MIN_VIEWPORT_SCALE });
    expect(zoomIn).toBeEnabled();
  });

  it("無効な拡大ボタンはクリックを受け付けない", () => {
    const onZoomIn = jest.fn();
    const { zoomIn } = renderControls({ scale: MAX_VIEWPORT_SCALE, onZoomIn });

    fireEvent.click(zoomIn);

    expect(onZoomIn).not.toHaveBeenCalled();
  });
});