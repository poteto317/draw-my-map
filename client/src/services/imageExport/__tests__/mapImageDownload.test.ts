import { downloadMapImage } from "@/services/imageExport/mapImageDownload";

const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

describe("mapImageDownload", () => {
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

  it("画像Blobを指定したファイル名でダウンロードしてURLを解放する", () => {
    const createObjectURL = jest.fn(() => "blob:map-image");
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
    const blob = new Blob(["<svg />"], { type: "image/svg+xml" });

    downloadMapImage(blob, "draw-my-map-20260920-123456.svg");

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.href).toBe("blob:map-image");
    expect(anchor.download).toBe("draw-my-map-20260920-123456.svg");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:map-image");
  });

  it("クリックが失敗しても画像のobject URLを解放する", () => {
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: jest.fn(() => "blob:map-image"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    jest.spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {
        throw new Error("download failed");
      });

    expect(() => downloadMapImage(new Blob(), "map.svg")).toThrow("download failed");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:map-image");
  });
});
