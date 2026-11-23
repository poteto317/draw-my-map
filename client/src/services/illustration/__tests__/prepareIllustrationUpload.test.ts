import {
  MAX_ILLUSTRATION_DATA_URL_LENGTH,
  MAX_ILLUSTRATION_UPLOAD_BYTES,
  MAX_ILLUSTRATION_UPLOAD_DIMENSION,
} from "@/config/illustration";
import {
  prepareIllustrationUpload,
  type PrepareIllustrationUploadDeps,
} from "@/services/illustration/prepareIllustrationUpload";
import { createJpegDataUrl } from "@/testing/jpegFixture";

const SOURCE = "data:image/png;base64,SRC";
const THUMB = "data:image/jpeg;base64,THUMB";

function deps(
  overrides: Partial<PrepareIllustrationUploadDeps> = {},
): PrepareIllustrationUploadDeps {
  return {
    readImageFile: jest.fn(async () => SOURCE),
    createThumbnail: jest.fn(async () => THUMB),
    loadImageDimensions: jest.fn(async () => ({ width: 200, height: 100 })),
    ...overrides,
  };
}

describe("prepareIllustrationUpload", () => {
  const file = new File(["png"], "photo.png", { type: "image/png" });

  it("読取→寸法検査→サムネイル→受理 data URL を返す", async () => {
    const options = deps();
    const result = await prepareIllustrationUpload(file, options);

    expect(options.readImageFile).toHaveBeenCalledWith(file);
    expect(options.loadImageDimensions).toHaveBeenCalledWith(SOURCE);
    expect(options.createThumbnail).toHaveBeenCalledWith(SOURCE);
    expect(result).toEqual({ ok: true, dataUrl: THUMB });
  });

  it("File.size が上限超過なら読取せず invalid", async () => {
    const huge = new File([new Uint8Array(MAX_ILLUSTRATION_UPLOAD_BYTES + 1)], "huge.png", {
      type: "image/png",
    });
    const options = deps();

    await expect(prepareIllustrationUpload(huge, options)).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(options.readImageFile).not.toHaveBeenCalled();
    expect(options.createThumbnail).not.toHaveBeenCalled();
  });

  it("JPEG のヘッダ寸法が上限超過ならサムネイルせず invalid", async () => {
    const over = MAX_ILLUSTRATION_UPLOAD_DIMENSION + 1;
    const jpegSource = createJpegDataUrl(over, 128);
    const options = deps({
      readImageFile: jest.fn(async () => jpegSource),
    });

    await expect(prepareIllustrationUpload(file, options)).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(options.loadImageDimensions).not.toHaveBeenCalled();
    expect(options.createThumbnail).not.toHaveBeenCalled();
  });

  it("非 JPEG のデコード直後寸法が上限超過ならサムネイルせず invalid", async () => {
    const options = deps({
      loadImageDimensions: jest.fn(async () => ({
        width: MAX_ILLUSTRATION_UPLOAD_DIMENSION + 1,
        height: 100,
      })),
    });

    await expect(prepareIllustrationUpload(file, options)).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(options.createThumbnail).not.toHaveBeenCalled();
  });

  it("サムネイルが illustration 上限外なら invalid", async () => {
    const tooLong = `data:image/jpeg;base64,${"A".repeat(MAX_ILLUSTRATION_DATA_URL_LENGTH)}`;
    const options = deps({
      createThumbnail: jest.fn(async () => tooLong),
    });

    await expect(prepareIllustrationUpload(file, options)).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("読取やサムネイルが例外なら failed", async () => {
    const options = deps({
      readImageFile: jest.fn(async () => {
        throw new Error("boom");
      }),
    });

    await expect(prepareIllustrationUpload(file, options)).resolves.toEqual({
      ok: false,
      reason: "failed",
    });
  });
});
