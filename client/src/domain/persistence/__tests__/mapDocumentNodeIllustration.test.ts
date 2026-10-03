import { createJpegDataUrl } from "@/testing/jpegFixture";
import { normalizeMapDocumentNodeIllustration } from "@/domain/persistence/mapDocumentNodeIllustration";

const DATA_URL = createJpegDataUrl(128, 128);

describe("normalizeMapDocumentNodeIllustration", () => {
  it.each([1, 2] as const)("V%dではillustrationを無視してundefinedを返す", (version) => {
    expect(normalizeMapDocumentNodeIllustration(DATA_URL, 0, version)).toEqual({ ok: true, value: undefined });
    expect(normalizeMapDocumentNodeIllustration("invalid", 0, version)).toEqual({ ok: true, value: undefined });
  });

  it("V3でundefinedなら、undefinedを返す", () => {
    expect(normalizeMapDocumentNodeIllustration(undefined, 0, 3)).toEqual({ ok: true, value: undefined });
  });

  it("V3で有効なdata URLなら、そのまま返す", () => {
    expect(normalizeMapDocumentNodeIllustration(DATA_URL, 1, 3)).toEqual({ ok: true, value: DATA_URL });
  });

  it.each([null, 1, "https://example.com/a.png", "data:text/html;base64,AAAA", "data:image/png;base64,AAAA", "data:image/jpeg;base64,AAAA", createJpegDataUrl(20000, 20000), createJpegDataUrl(513, 128), createJpegDataUrl(0, 0), {}])(
    "V3で不正なillustration=%pを拒否する",
    (illustration) => {
      expect(normalizeMapDocumentNodeIllustration(illustration, 2, 3)).toEqual({
        ok: false,
        error: "node[2].illustrationは、画像のdata URLである必要があります。",
      });
    },
  );
});
