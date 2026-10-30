import { createMapImageFileName } from "@/services/imageExport/mapImageFileName";

describe("mapImageFileName", () => {
  it("マップ名とローカル日時をゼロ埋めした画像ファイル名を作る", () => {
    const now = new Date(2026, 9, 21, 9, 5, 7);

    expect(createMapImageFileName("png", "旅行", now))
      .toBe("旅行-20261021-090507.png");
    expect(createMapImageFileName("svg", "旅行", now))
      .toBe("旅行-20261021-090507.svg");
  });

  it("日時を渡さないときは現在のローカル日時を使う", () => {
    jest.useFakeTimers({ now: new Date(2026, 0, 2, 3, 4, 5) });
    try {
      expect(createMapImageFileName("png", "旅行")).toBe("旅行-20260102-030405.png");
    } finally {
      jest.useRealTimers();
    }
  });

  it("Windowsの予約名は先頭に_を付ける", () => {
    const now = new Date(2026, 9, 21, 9, 5, 7);

    expect(createMapImageFileName("png", "CON", now))
      .toBe("_CON-20261021-090507.png");
  });
});
