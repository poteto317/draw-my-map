import { MAX_ILLUSTRATION_IMAGE_DIMENSION } from "@/config/illustration";
import {
  getJpegDimensions,
  isAcceptableIllustrationSize,
} from "@/domain/illustration/jpegDimensions";
import { bytesToJpegDataUrl, createJpegBytes, createJpegDataUrl } from "@/testing/jpegFixture";

describe("getJpegDimensions", () => {
  it("SOF0 の縦横を読む", () => {
    expect(getJpegDimensions(createJpegDataUrl(128, 64))).toEqual({ width: 128, height: 64 });
  });

  it.each([0xc1, 0xc2, 0xc3, 0xc5, 0xc9, 0xcf])("SOF マーカー 0x%s でも縦横を読む", (marker) => {
    expect(getJpegDimensions(createJpegDataUrl(300, 200, marker))).toEqual({ width: 300, height: 200 });
  });

  it("巨大な寸法も、そのまま読む", () => {
    expect(getJpegDimensions(createJpegDataUrl(20000, 20000))).toEqual({ width: 20000, height: 20000 });
  });

  it("SOF の前に詰め物の 0xFF があっても、縦横を読む", () => {
    const bytes = createJpegBytes(128, 64);
    const withFill = [...bytes.slice(0, 8), 0xff, 0xff, ...bytes.slice(8)];
    expect(getJpegDimensions(bytesToJpegDataUrl(withFill))).toEqual({ width: 128, height: 64 });
  });

  it("SOF の前の RST(0xd0〜0xd7)・TEM(0x01) は、長さ無しとして読み飛ばす", () => {
    const bytes = createJpegBytes(128, 64);
    const skipped = [...bytes.slice(0, 8), 0xff, 0xd0, 0xff, 0xd7, 0xff, 0x01, ...bytes.slice(8)];
    expect(getJpegDimensions(bytesToJpegDataUrl(skipped))).toEqual({ width: 128, height: 64 });
  });

  it("SOF が複数あるときは、先頭の SOF の縦横を採用する", () => {
    const first = createJpegBytes(100, 50);
    const second = createJpegBytes(300, 200, 0xc2).slice(8, -2);
    expect(getJpegDimensions(bytesToJpegDataUrl([...first.slice(0, -2), ...second, 0xff, 0xd9]))).toEqual({
      width: 100,
      height: 50,
    });
  });

  it("DHT(0xc4)・JPG(0xc8)・DAC(0xcc) は SOF として扱わない", () => {
    for (const marker of [0xc4, 0xc8, 0xcc]) {
      expect(getJpegDimensions(createJpegDataUrl(128, 128, marker))).toBeNull();
    }
  });

  it("SOF が無い（SOS や EOI に達する）なら null", () => {
    expect(getJpegDimensions(bytesToJpegDataUrl([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
    expect(getJpegDimensions(bytesToJpegDataUrl([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]))).toBeNull();
  });

  it("途中で切れた入力は null", () => {
    const bytes = createJpegBytes(128, 128);
    // 幅の下位バイト（17 バイト目）まで揃えば読めるので、それ未満で切る
    for (let length = 0; length < 17; length += 1) {
      expect(getJpegDimensions(bytesToJpegDataUrl(bytes.slice(0, length)))).toBeNull();
    }
  });

  it("セグメント長が不正（0、1、範囲外）でも、止まって null を返す", () => {
    expect(getJpegDimensions(bytesToJpegDataUrl([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0x00, 0x00]))).toBeNull();
    expect(getJpegDimensions(bytesToJpegDataUrl([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01, 0x00, 0x00]))).toBeNull();
    expect(getJpegDimensions(bytesToJpegDataUrl([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff, 0x00, 0x00]))).toBeNull();
  });

  it("マーカーでない位置は null", () => {
    expect(getJpegDimensions(bytesToJpegDataUrl([0xff, 0xd8, 0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });

  it("JPEG でない（SOI が無い）なら null", () => {
    expect(getJpegDimensions(bytesToJpegDataUrl([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBeNull();
  });

  it("data URL でない・base64 でないなら null", () => {
    expect(getJpegDimensions("https://example.com/a.jpg")).toBeNull();
    expect(getJpegDimensions("data:image/jpeg;base64,")).toBeNull();
    expect(getJpegDimensions("data:image/jpeg;base64,@@@@")).toBeNull();
    expect(getJpegDimensions("data:image/jpeg;base64,AAAA")).toBeNull();
  });
});

describe("isAcceptableIllustrationSize", () => {
  it("1 以上、上限以下なら true", () => {
    expect(isAcceptableIllustrationSize(createJpegDataUrl(1, 1))).toBe(true);
    expect(isAcceptableIllustrationSize(createJpegDataUrl(128, 128))).toBe(true);
    expect(
      isAcceptableIllustrationSize(
        createJpegDataUrl(MAX_ILLUSTRATION_IMAGE_DIMENSION, MAX_ILLUSTRATION_IMAGE_DIMENSION),
      ),
    ).toBe(true);
  });

  it("上限を超える寸法は false", () => {
    const over = MAX_ILLUSTRATION_IMAGE_DIMENSION + 1;
    expect(isAcceptableIllustrationSize(createJpegDataUrl(over, 128))).toBe(false);
    expect(isAcceptableIllustrationSize(createJpegDataUrl(128, over))).toBe(false);
    expect(isAcceptableIllustrationSize(createJpegDataUrl(20000, 20000))).toBe(false);
  });

  it("幅か高さが 0 なら false", () => {
    expect(isAcceptableIllustrationSize(createJpegDataUrl(0, 128))).toBe(false);
    expect(isAcceptableIllustrationSize(createJpegDataUrl(128, 0))).toBe(false);
  });

  it("寸法が読めないなら false", () => {
    expect(isAcceptableIllustrationSize("data:image/jpeg;base64,AAAA")).toBe(false);
  });
});
