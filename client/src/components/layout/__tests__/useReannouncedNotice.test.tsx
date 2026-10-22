import { act, renderHook } from "@testing-library/react";
import { useReannouncedNotice } from "@/components/layout/useReannouncedNotice";

describe("useReannouncedNotice", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("フレームの前にアンマウントすると予約したフレームを取り消す", () => {
    const request = jest.spyOn(window, "requestAnimationFrame");
    const cancel = jest.spyOn(window, "cancelAnimationFrame");
    const { unmount } = renderHook(() => useReannouncedNotice(1, "成功"));
    const frame = request.mock.results[0].value;

    expect(cancel).not.toHaveBeenCalled();
    unmount();

    expect(cancel).toHaveBeenCalledWith(frame);
  });

  it("フレームの前に通知が続くと前のフレームを取り消し、最新の値だけを入れる", () => {
    const request = jest.spyOn(window, "requestAnimationFrame");
    const cancel = jest.spyOn(window, "cancelAnimationFrame");
    const { result, rerender } = renderHook(
      ({ sequence, value }) => useReannouncedNotice(sequence, value),
      { initialProps: { sequence: 1, value: "一つ目" } },
    );
    const firstFrame = request.mock.results[0].value;

    rerender({ sequence: 2, value: "二つ目" });

    expect(cancel).toHaveBeenCalledWith(firstFrame);
    expect(result.current).toBeNull();

    act(() => {
      jest.advanceTimersToNextFrame();
    });

    expect(result.current).toBe("二つ目");
  });
});
