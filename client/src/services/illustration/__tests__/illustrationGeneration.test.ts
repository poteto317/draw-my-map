import {
  generateIllustrationThumbnail,
  toIllustrationErrorKind,
} from "@/services/illustration/illustrationGeneration";
import {
  IllustrationRequestError,
  requestIllustration,
} from "@/services/illustration/illustrationClient";
import {
  IllustrationThumbnailError,
  createIllustrationThumbnail,
} from "@/services/illustration/illustrationThumbnail";

jest.mock("@/services/illustration/illustrationClient", () => {
  const actual = jest.requireActual("@/services/illustration/illustrationClient");
  return { ...actual, requestIllustration: jest.fn() };
});

jest.mock("@/services/illustration/illustrationThumbnail", () => {
  const actual = jest.requireActual("@/services/illustration/illustrationThumbnail");
  return { ...actual, createIllustrationThumbnail: jest.fn() };
});

const mockRequest = requestIllustration as jest.MockedFunction<typeof requestIllustration>;
const mockThumbnail = createIllustrationThumbnail as jest.MockedFunction<typeof createIllustrationThumbnail>;

describe("generateIllustrationThumbnail", () => {
  beforeEach(() => {
    mockRequest.mockReset();
    mockThumbnail.mockReset();
  });

  it("ラベルで生成し、signalを渡し、生成画像を縮小したdata URLを返す", async () => {
    const controller = new AbortController();
    mockRequest.mockResolvedValue({ dataUrl: "data:image/png;base64,FULL" });
    mockThumbnail.mockResolvedValue("data:image/jpeg;base64,THUMB");

    await expect(generateIllustrationThumbnail("猫", { signal: controller.signal })).resolves.toBe(
      "data:image/jpeg;base64,THUMB",
    );
    expect(mockRequest).toHaveBeenCalledWith("猫", { signal: controller.signal });
    expect(mockThumbnail).toHaveBeenCalledWith("data:image/png;base64,FULL");
  });

  it("生成に失敗したら、縮小せずに、そのエラーを伝える", async () => {
    const error = new IllustrationRequestError("network");
    mockRequest.mockRejectedValue(error);

    await expect(generateIllustrationThumbnail("猫", {})).rejects.toBe(error);
    expect(mockThumbnail).not.toHaveBeenCalled();
  });

  it("縮小に失敗したら、そのエラーを伝える", async () => {
    const error = new IllustrationThumbnailError();
    mockRequest.mockResolvedValue({ dataUrl: "data:image/png;base64,FULL" });
    mockThumbnail.mockRejectedValue(error);

    await expect(generateIllustrationThumbnail("猫", {})).rejects.toBe(error);
  });

  it("中断（AbortError）は、そのまま伝える", async () => {
    const abort = new DOMException("aborted", "AbortError");
    mockRequest.mockRejectedValue(abort);

    await expect(generateIllustrationThumbnail("猫", {})).rejects.toBe(abort);
  });
});

describe("toIllustrationErrorKind", () => {
  it("IllustrationRequestErrorは、その種別を返す", () => {
    expect(toIllustrationErrorKind(new IllustrationRequestError("quota-exceeded"))).toBe("quota-exceeded");
  });

  it("IllustrationThumbnailErrorは、image-processingを返す", () => {
    expect(toIllustrationErrorKind(new IllustrationThumbnailError())).toBe("image-processing");
  });

  it.each([new Error("x"), "x", null, undefined])("その他(%p)は、upstream-errorを返す", (error) => {
    expect(toIllustrationErrorKind(error)).toBe("upstream-error");
  });
});
