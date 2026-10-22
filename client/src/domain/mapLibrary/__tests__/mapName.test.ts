import {
  countMapNameLength,
  DEFAULT_MAP_NAME,
  MAX_MAP_NAME_LENGTH,
  normalizeMapName,
  normalizeStoredMapName,
  validateMapNameInput,
} from "../mapName";

describe("normalizeMapName", () => {
  it("前後の空白を除く", () => {
    expect(normalizeMapName("  旅行  ")).toBe("旅行");
  });

  it("空や空白だけの入力は既定の名前にする", () => {
    expect(normalizeMapName("")).toBe(DEFAULT_MAP_NAME);
    expect(normalizeMapName("   ")).toBe("無題のマップ");
  });

  it("制御文字を空白へ置き換え、末尾の空白も除く", () => {
    expect(normalizeMapName("a\tb\nc\u007f")).toBe("a b c");
  });

  it("制御文字だけの入力は既定の名前にする", () => {
    expect(normalizeMapName("\u0000")).toBe("無題のマップ");
  });
});

describe("countMapNameLength", () => {
  it("サロゲートペアを1文字と数える", () => {
    expect(countMapNameLength("😀")).toBe(1);
  });

  it("ZWJ 結合の絵文字はコードポイント数で数える", () => {
    expect(countMapNameLength("👨‍👩‍👧")).toBe(5);
  });

  it("50文字の日本語は50と数える", () => {
    expect(countMapNameLength("あ".repeat(50))).toBe(50);
  });
});

describe("validateMapNameInput", () => {
  it("上限は50文字", () => {
    expect(MAX_MAP_NAME_LENGTH).toBe(50);
  });

  it("49文字と50文字は受け付ける", () => {
    expect(validateMapNameInput("a".repeat(49))).toEqual({
      ok: true,
      name: "a".repeat(49),
    });
    const fifty = "a".repeat(49) + "😀";
    expect(validateMapNameInput(fifty)).toEqual({ ok: true, name: fifty });
  });

  it("51文字は文字数つきのメッセージで拒否する", () => {
    expect(validateMapNameInput("😀".repeat(51))).toEqual({
      ok: false,
      length: 51,
      message: "マップ名は50文字以内で入力してください。（現在 51 文字）",
    });
  });

  it("前後の空白は文字数に数えない", () => {
    const name = "a".repeat(50);
    expect(validateMapNameInput(` ${name} `)).toEqual({ ok: true, name });
  });

  it("空の入力は既定の名前で受け付ける", () => {
    expect(validateMapNameInput("  ")).toEqual({
      ok: true,
      name: DEFAULT_MAP_NAME,
    });
  });
});

describe("normalizeStoredMapName", () => {
  it("先頭50コードポイントへ切り詰め、サロゲートペアを壊さない", () => {
    expect(normalizeStoredMapName("😀".repeat(60))).toBe("😀".repeat(50));
  });

  it("空は既定の名前にする", () => {
    expect(normalizeStoredMapName("")).toBe("無題のマップ");
  });
});
