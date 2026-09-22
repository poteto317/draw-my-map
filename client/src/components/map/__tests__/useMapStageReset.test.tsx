import { renderHook } from "@testing-library/react";
import { INITIAL_VIEWPORT } from "@/components/map/mapViewport";
import { useMapStageReset } from "@/components/map/useMapStageReset";

describe("useMapStageReset", () => {
  it("revisionのcommit時に編集・gesture・viewportを同期リセットする", () => {
    const cancelEditing = jest.fn();
    const cancelActiveGesture = jest.fn();
    const setViewport = jest.fn();
    const { rerender } = renderHook(
      ({ revision }) => useMapStageReset({
        resetRevision: revision,
        cancelEditing,
        cancelActiveGesture,
        setViewport,
      }),
      { initialProps: { revision: 0 } },
    );
    jest.clearAllMocks();

    rerender({ revision: 1 });

    expect(cancelEditing).toHaveBeenCalledTimes(1);
    expect(cancelActiveGesture).toHaveBeenCalledTimes(1);
    expect(setViewport).toHaveBeenCalledWith(INITIAL_VIEWPORT);
  });
});
