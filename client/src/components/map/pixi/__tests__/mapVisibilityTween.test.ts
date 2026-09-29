import { sampleVisibilityTween } from "@/components/map/pixi/mapVisibilityTween";

describe("sampleVisibilityTween", () => {
  it("cubic ease-outで進行中のopacityを補間する", () => {
    expect(sampleVisibilityTween({
      from: 0,
      to: 1,
      startedAt: 100,
      durationMs: 160,
    }, 180)).toEqual({ opacity: 0.875, done: false });
  });

  it("duration終端では正確に終了値を返す", () => {
    expect(sampleVisibilityTween({
      from: 1,
      to: 0,
      startedAt: 100,
      durationMs: 160,
    }, 260)).toEqual({ opacity: 0, done: true });
  });

  it("開始前と終了後のprogressをendpointへclampする", () => {
    const tween = { from: 0.25, to: 0.75, startedAt: 100, durationMs: 160 };

    expect(sampleVisibilityTween(tween, 0)).toEqual({ opacity: 0.25, done: false });
    expect(sampleVisibilityTween(tween, 500)).toEqual({ opacity: 0.75, done: true });
  });
});
