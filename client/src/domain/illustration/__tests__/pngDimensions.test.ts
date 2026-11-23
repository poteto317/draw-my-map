import { getPngDimensions } from "@/domain/illustration/pngDimensions";
import { bytesToPngDataUrl, createPngBytes, createPngDataUrl } from "@/testing/pngFixture";

describe("getPngDimensions", () => {
  it("IHDR の縦横を読む", () => {
    expect(getPngDimensions(createPngDataUrl(128, 64))).toEqual({ width: 128, height: 64 });
  });

  it("巨大な寸法も、そのまま読む", () => {
    expect(getPngDimensions(createPngDataUrl(20000, 20000))).toEqual({
      width: 20000,
      height: 20000,
    });
  });

  it("署名が無い・途中切れは null", () => {
    expect(getPngDimensions(bytesToPngDataUrl([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
    const bytes = createPngBytes(10, 10);
    expect(getPngDimensions(bytesToPngDataUrl(bytes.slice(0, 20)))).toBeNull();
  });

  it("先頭チャンクが IHDR でない・長さ不正は null", () => {
    const bytes = createPngBytes(10, 10);
    bytes[11] = 0x0e; // length ≠ 13
    expect(getPngDimensions(bytesToPngDataUrl(bytes))).toBeNull();

    const notIhdr = createPngBytes(10, 10);
    notIhdr[12] = 0x49;
    notIhdr[13] = 0x45;
    notIhdr[14] = 0x4e;
    notIhdr[15] = 0x44; // "IEND"
    expect(getPngDimensions(bytesToPngDataUrl(notIhdr))).toBeNull();
  });

  it("data URL でない・base64 でない・接頭が PNG でないなら null", () => {
    expect(getPngDimensions("https://example.com/a.png")).toBeNull();
    expect(getPngDimensions("data:image/png;base64,@@@@")).toBeNull();
    expect(getPngDimensions("data:image/jpeg;base64,AAAA")).toBeNull();
  });
});
