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

  it("既定の呼び出しの結果は id の形式を満たす", () => {
    expect(isValidMapId(generateMapId())).toBe(true);
  });
});
