import type { PointerGesture, PointerSample } from "@/components/map/pixi/pointerGesture";
import { createPointerGestureSession } from "@/components/map/pixi/pointerGestureSession";

const sample = (pointerId: number): PointerSample => ({
  pointerId,
  pointerType: "mouse",
  screen: { x: 10, y: 20 },
  world: { x: 10, y: 20 },
});

const gesture = (overrides: Partial<PointerGesture> = {}): PointerGesture => ({
  move: jest.fn(),
  end: jest.fn(),
  cancel: jest.fn(),
  ...overrides,
});

describe("createPointerGestureSession", () => {
  it("所有pointerのmoveとendだけをactive gestureへ配送する", () => {
    const session = createPointerGestureSession();
    const active = gesture();
    session.start(1, active);

    session.move(sample(2));
    session.move(sample(1));
    session.end(sample(2));
    session.end(sample(1));

    expect(active.move).toHaveBeenCalledTimes(1);
    expect(active.end).toHaveBeenCalledTimes(1);
    expect(session.hasActive()).toBe(false);
  });

  it("cancel callbackから開始された新しいgestureを維持する", () => {
    const session = createPointerGestureSession();
    const replacement = gesture();
    const first = gesture({
      cancel: jest.fn(() => {
        session.start(2, replacement);
      }),
    });
    session.start(1, first);

    session.cancel();
    session.move(sample(2));

    expect(replacement.move).toHaveBeenCalledTimes(1);
    expect(session.hasActive()).toBe(true);
  });

  it("end callbackから開始された新しいgestureを維持する", () => {
    const session = createPointerGestureSession();
    const replacement = gesture();
    const first = gesture({
      end: jest.fn(() => {
        session.start(2, replacement);
      }),
    });
    session.start(1, first);

    session.end(sample(1));
    session.move(sample(2));

    expect(replacement.move).toHaveBeenCalledTimes(1);
    expect(session.hasActive()).toBe(true);
  });

  it("古いleaseのclearで置換後のgestureを破棄しない", () => {
    const session = createPointerGestureSession();
    const firstLease = session.start(1, gesture())!;
    session.cancel();
    const replacement = gesture();
    session.start(2, replacement);

    session.clear(firstLease);
    session.move(sample(2));

    expect(replacement.move).toHaveBeenCalledTimes(1);
  });
});
