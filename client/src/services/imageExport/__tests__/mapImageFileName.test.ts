import { createMapImageFileName } from "@/services/imageExport/mapImageFileName";

describe("mapImageFileName", () => {
  it("ローカル日時をゼロ埋めした画像ファイル名を作る", () => {
    const now = new Date(2026, 8, 20, 12, 34, 56);

    expect(createMapImageFileName("svg", now))
      .toBe("draw-my-map-20260920-123456.svg");
    expect(createMapImageFileName("png", now))
      .toBe("draw-my-map-20260920-123456.png");
  });
});
