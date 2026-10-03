import { isIllustrationDataUrl } from "@/domain/illustration/illustrationDataUrl";
import { MAX_ILLUSTRATION_DATA_URL_LENGTH } from "@/config/illustration";

describe("isIllustrationDataUrl", () => {
  it("jpeg の base64 data URL を受け付ける", () => {
    expect(isIllustrationDataUrl("data:image/jpeg;base64,AAAA")).toBe(true);
  });

  it.each(["png", "webp"])("%s は拒否する（アプリが出力するのは jpeg だけ）", (type) => {
    expect(isIllustrationDataUrl(`data:image/${type};base64,AAAA`)).toBe(false);
  });

  it.each([
    ["文字列でない", 1],
    ["null", null],
    ["svg は不可（スクリプトを含みうる）", "data:image/svg+xml;base64,AAAA"],
    ["base64 でない", "data:image/jpeg,AAAA"],
    ["http の URL", "https://example.com/a.png"],
    ["本体が空", "data:image/jpeg;base64,"],
    ["属性を壊す文字を含む", 'data:image/jpeg;base64,AA"AA'],
    ["改行を含む", "data:image/jpeg;base64,AA\nAA"],
  ])("%s は拒否する", (_name, value) => {
    expect(isIllustrationDataUrl(value)).toBe(false);
  });

  it("上限ちょうどは受け付け、1文字超えると拒否する", () => {
    const prefix = "data:image/jpeg;base64,";
    const atLimit = prefix + "A".repeat(MAX_ILLUSTRATION_DATA_URL_LENGTH - prefix.length);
    expect(isIllustrationDataUrl(atLimit)).toBe(true);
    expect(isIllustrationDataUrl(`${atLimit}A`)).toBe(false);
  });
});
