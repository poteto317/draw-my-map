import { calculateCoverCrop } from "@/domain/illustration/illustrationCrop";

describe("calculateCoverCrop", () => {
  it("正方形は、全体を使う", () => {
    expect(calculateCoverCrop(1024, 1024)).toEqual({ sx: 0, sy: 0, size: 1024 });
  });
  it("横長は、中央の正方形を使う", () => {
    expect(calculateCoverCrop(200, 100)).toEqual({ sx: 50, sy: 0, size: 100 });
  });
  it("縦長は、中央の正方形を使う", () => {
    expect(calculateCoverCrop(100, 300)).toEqual({ sx: 0, sy: 100, size: 100 });
  });
});
