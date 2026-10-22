import { createMapImageFileName } from "@/services/imageExport/mapImageFileName";

describe("mapImageFileName", () => {
  it("マップ名とローカル日時をゼロ埋めした画像ファイル名を作る", () => {
    const now = new Date(2026, 9, 21, 9, 5, 7);

    expect(createMapImageFileName("png", "旅行", now))
      .toBe("旅行-20261021-090507.png");
    expect(createMapImageFileName("svg", "旅行", now))
      .toBe("旅行-20261021-090507.svg");
  });

  it("Windowsの予約名は先頭に_を付ける", () => {
    const now = new Date(2026, 9, 21, 9, 5, 7);

    expect(createMapImageFileName("png", "CON", now))
      .toBe("_CON-20261021-090507.png");
  });
});
