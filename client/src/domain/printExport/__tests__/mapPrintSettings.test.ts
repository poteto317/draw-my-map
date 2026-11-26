import { parseMapPrintMargin } from "@/domain/printExport/mapPrintSettings";

describe("parseMapPrintMargin", () => {
  it.each([
    ["0", 0],
    ["50", 50],
    ["10.1", 10.1],
    [".1", 0.1],
  ])("範囲内の10進表記 %j を数値 %s に変換する", (value, expected) => {
    expect(parseMapPrintMargin(value)).toBe(expected);
  });

  it.each(["", "-1", "-1e-400", "1e1", "50.1", "50.000000000000001", "10.01"])(
    "無効な余白 %j をNaNにする",
    (value) => {
      expect(parseMapPrintMargin(value)).toBeNaN();
    },
  );
});
