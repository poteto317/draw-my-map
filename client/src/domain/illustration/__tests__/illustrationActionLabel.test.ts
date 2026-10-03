import { getIllustrationActionLabel } from "@/domain/illustration/illustrationActionLabel";

describe("getIllustrationActionLabel", () => {
  it("イラストが無いときは「イラストを生成」", () => {
    expect(getIllustrationActionLabel(false)).toBe("イラストを生成");
  });

  it("イラストがあるときは「イラストを再生成」", () => {
    expect(getIllustrationActionLabel(true)).toBe("イラストを再生成");
  });
});
