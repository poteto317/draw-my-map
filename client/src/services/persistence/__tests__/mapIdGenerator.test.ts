import { isValidMapId } from "@/domain/mapLibrary/mapIndex";
import { generateMapId } from "../mapIdGenerator";

describe("generateMapId", () => {
  it("randomUUID を渡すとその値を返す", () => {
    expect(generateMapId({ randomUUID: () => "uuid-1" })).toBe("uuid-1");
  });

  it("randomUUID が無いときは時刻と乱数を - でつなぐ", () => {
    expect(
      generateMapId({
        randomUUID: null,
        now: () => 36 ** 3,
        random: () => 0.5,
      }),
    ).toBe("1000-i");
  });

  it("randomUUID が無く時刻と乱数も渡さないときは Date.now と Math.random を使う", () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(36 ** 3);
    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const id = generateMapId({ randomUUID: null });

      expect(id).toBe("1000-i");
      expect(isValidMapId(id)).toBe(true);
    } finally {
      nowSpy.mockRestore();
      randomSpy.mockRestore();
    }
  });

  it("既定の呼び出しの結果は id の形式を満たす", () => {
    expect(isValidMapId(generateMapId())).toBe(true);
  });
});
