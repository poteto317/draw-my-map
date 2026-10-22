import {
  createMapJsonFileName,
  downloadMapJson,
} from "@/services/persistence/mapJsonDownload";

const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

describe("mapJsonDownload", () => {
  afterEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectUrl,
    });
    jest.restoreAllMocks();
  });

  it("マップ名とローカル日時をゼロ埋めしたJSONファイル名を作る", () => {
    expect(createMapJsonFileName("旅行", new Date(2026, 9, 21, 9, 5, 7)))
      .toBe("旅行-20261021-090507.json");
  });

  it("ファイル名に使えない文字を置き換える", () => {
    expect(createMapJsonFileName("a/b", new Date(2026, 9, 21, 9, 5, 7)))
      .toBe("a_b-20261021-090507.json");
  });

  it("空の名前では draw-my-map を使う", () => {
    expect(createMapJsonFileName("", new Date(2026, 9, 21, 9, 5, 7)))
      .toBe("draw-my-map-20261021-090507.json");
  });

  it("JSON Blobを日時付きファイルとしてダウンロードしてURLを解放する", () => {
    const createObjectURL = jest.fn((blob: Blob) => {
      void blob;
      return "blob:map-json";
    });
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    downloadMapJson("{}\n", "旅行", new Date(2026, 8, 20, 12, 34, 56));

    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob).toMatchObject({ type: "application/json" });
    expect(click).toHaveBeenCalledTimes(1);
    const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.href).toBe("blob:map-json");
    expect(anchor.download).toBe("旅行-20260920-123456.json");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:map-json");
  });

  it("クリックが失敗してもobject URLを解放する", () => {
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: jest.fn(() => "blob:map-json"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    jest.spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {
        throw new Error("download failed");
      });

    expect(() => downloadMapJson("{}\n", "旅行")).toThrow("download failed");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:map-json");
  });
});
