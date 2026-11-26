import { planPublishTransition } from "@/domain/share/planPublishTransition";

describe("planPublishTransition", () => {
  it("初回（current が null）でも next を current にする", () => {
    expect(
      planPublishTransition({
        currentRevisionId: null,
        nextRevisionId: "rev-1",
      }),
    ).toEqual({ nextCurrentRevisionId: "rev-1" });
  });

  it("既存 current があっても next で差し替える（旧は保持しない）", () => {
    expect(
      planPublishTransition({
        currentRevisionId: "rev-old",
        nextRevisionId: "rev-new",
      }),
    ).toEqual({ nextCurrentRevisionId: "rev-new" });
  });
});
