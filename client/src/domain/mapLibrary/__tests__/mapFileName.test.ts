import {
  createMapFileName,
  formatMapFileTimestamp,
  toSafeFileNameBase,
} from "../mapFileName";

describe("toSafeFileNameBase", () => {
  it("禁止文字を _ に置き換える", () => {
    expect(toSafeFileNameBase("a/b:c*?")).toBe("a_b_c__");
    expect(toSafeFileNameBase('x\\y"z<>|')).toBe("x_y_z___");
  });

  it("制御文字を _ に置き換える", () => {
    expect(toSafeFileNameBase("a\u0001b")).toBe("a_b");
  });

  it("連続する空白をまとめ、前後の空白を除く", () => {
    expect(toSafeFileNameBase("  a   b  ")).toBe("a b");
  });

  it("先頭の . と末尾の . と空白を除く", () => {
    expect(toSafeFileNameBase("..secret.")).toBe("secret");
    expect(toSafeFileNameBase("name. . ")).toBe("name");
  });

  it("Windows の予約名は先頭に _ を付ける", () => {
    expect(toSafeFileNameBase("CON")).toBe("_CON");
    expect(toSafeFileNameBase("con")).toBe("_con");
    expect(toSafeFileNameBase("LPT9")).toBe("_LPT9");
  });

  it("予約名を含むだけの名前は変えない", () => {
    expect(toSafeFileNameBase("CONSOLE")).toBe("CONSOLE");
  });

  it("空になる場合は draw-my-map にする", () => {
    expect(toSafeFileNameBase("")).toBe("draw-my-map");
    expect(toSafeFileNameBase("...")).toBe("draw-my-map");
    expect(toSafeFileNameBase("   ")).toBe("draw-my-map");
  });

  it("日本語と絵文字はそのまま残す", () => {
    expect(toSafeFileNameBase("旅行😀")).toBe("旅行😀");
  });
});

describe("formatMapFileTimestamp", () => {
  it("ローカル時刻を YYYYMMDD-HHmmss に整形する", () => {
    expect(formatMapFileTimestamp(new Date(2026, 9, 21, 9, 5, 7))).toBe(
      "20261021-090507",
    );
  });
});

describe("createMapFileName", () => {
  const now = new Date(2026, 9, 21, 9, 5, 7);

  it.each(["json", "png", "svg"] as const)(
    "%s のファイル名を組み立てる",
    (extension) => {
      expect(createMapFileName("旅行/計画", extension, now)).toBe(
        `旅行_計画-20261021-090507.${extension}`,
      );
    },
  );
});
