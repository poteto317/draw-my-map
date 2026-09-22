import { readMapJsonFile } from "@/services/persistence/mapJsonFileReader";

describe("mapJsonFileReader", () => {
  it("選択されたJSONファイルを文字列として読み取る", async () => {
    const json = "{\"version\":1}\n";
    const file = new File([json], "map.json", { type: "application/json" });
    Object.defineProperty(file, "text", {
      configurable: true,
      value: jest.fn().mockResolvedValue(json),
    });

    await expect(readMapJsonFile(file)).resolves.toEqual({
      ok: true,
      value: json,
    });
  });

  it("ファイル読み取り例外を利用者向けエラーへ変換する", async () => {
    const file = new File([], "map.json", { type: "application/json" });
    Object.defineProperty(file, "text", {
      configurable: true,
      value: jest.fn().mockRejectedValue(new Error("read failed")),
    });

    await expect(readMapJsonFile(file)).resolves.toEqual({
      ok: false,
      error: "JSONファイルを読み取れませんでした。",
    });
  });
});
