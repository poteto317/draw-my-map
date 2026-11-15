import type { PointerGesture, PointerSample } from "@/components/map/pixi/pointerGesture";
import { wrapBackgroundGesture } from "@/components/map/pixi/wrapBackgroundGesture";

const sample: PointerSample = {
  pointerId: 1,
  pointerType: "mouse",
  screen: { x: 0, y: 0 },
  world: { x: 0, y: 0 },
};

function createInner(activated: boolean): PointerGesture & {
  end: jest.Mock;
  cancel: jest.Mock;
  move: jest.Mock;
} {
  return {
    move: jest.fn(),
    end: jest.fn(),
    cancel: jest.fn(),
    isActivated: () => activated,
  };
}

describe("wrapBackgroundGesture", () => {
  it("未 activated の end / cancel で選択解除する", () => {
    const onClearSelection = jest.fn();
    const inner = createInner(false);
    const wrapped = wrapBackgroundGesture(inner, onClearSelection);

    wrapped.end(sample);
    expect(inner.end).toHaveBeenCalledWith(sample);
    expect(onClearSelection).toHaveBeenCalledTimes(1);

    onClearSelection.mockClear();
    const inner2 = createInner(false);
    wrapBackgroundGesture(inner2, onClearSelection).cancel();
    expect(inner2.cancel).toHaveBeenCalled();
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it("activated 済みの end / cancel では選択解除しない", () => {
    const onClearSelection = jest.fn();
    const inner = createInner(true);
    const wrapped = wrapBackgroundGesture(inner, onClearSelection);

    wrapped.end(sample);
    wrapped.cancel();
    expect(onClearSelection).not.toHaveBeenCalled();
  });

  it("move と isActivated は内側へ委譲する", () => {
    const inner = createInner(true);
    const wrapped = wrapBackgroundGesture(inner, jest.fn());

    wrapped.move(sample);
    expect(inner.move).toHaveBeenCalledWith(sample);
    expect(wrapped.isActivated?.()).toBe(true);
  });
});
