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
import { createPngDataUrl } from "@/testing/pngFixture";

const THUMB = "data:image/jpeg;base64,THUMB";

function deps(
  overrides: Partial<PrepareIllustrationUploadDeps> = {},
): PrepareIllustrationUploadDeps {
  return {
    readImageFile: jest.fn(async () => createPngDataUrl(200, 100)),
    createThumbnail: jest.fn(async () => THUMB),
    ...overrides,
  };
}

describe("prepareIllustrationUpload", () => {
  const file = new File(["png"], "photo.png", { type: "image/png" });

  it("読取→ヘッダ寸法検査→サムネイル→受理 data URL を返す", async () => {
    const source = createPngDataUrl(200, 100);
    const options = deps({
      readImageFile: jest.fn(async () => source),
    });
    const result = await prepareIllustrationUpload(file, options);

    expect(options.readImageFile).toHaveBeenCalledWith(file);
    expect(options.createThumbnail).toHaveBeenCalledWith(source);
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
    expect(options.createThumbnail).not.toHaveBeenCalled();
  });

  it("PNG の IHDR 寸法が上限超過ならサムネイルせず invalid（デコード前拒否）", async () => {
    const over = MAX_ILLUSTRATION_UPLOAD_DIMENSION + 1;
    const pngSource = createPngDataUrl(over, 100);
    const options = deps({
      readImageFile: jest.fn(async () => pngSource),
    });

    await expect(prepareIllustrationUpload(file, options)).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(options.createThumbnail).not.toHaveBeenCalled();
  });

  it("ヘッダ寸法が取れない形式はサムネイルせず invalid", async () => {
    const options = deps({
      readImageFile: jest.fn(async () => "data:image/webp;base64,AAAA"),
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
