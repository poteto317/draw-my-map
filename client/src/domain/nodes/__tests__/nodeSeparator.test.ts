import {
  MERGE_DEFAULT_SEPARATOR,
  NODE_SEPARATOR_CUSTOM_ID,
  NODE_SEPARATOR_PRESETS,
  SPLIT_DEFAULT_SEPARATOR,
  findSeparatorPresetId,
  resolveSeparator,
} from "@/domain/nodes/nodeSeparator";

describe("NODE_SEPARATOR_PRESETS", () => {
  it("、 / , / / / ・ / 半角スペースの順に並ぶ", () => {
    expect(NODE_SEPARATOR_PRESETS).toEqual([
      { id: "ja-comma", label: "、", value: "、" },
      { id: "comma", label: ",", value: "," },
      { id: "slash", label: "/", value: "/" },
      { id: "middle-dot", label: "・", value: "・" },
      { id: "space", label: "半角スペース", value: " " },
    ]);
  });

  it("id は重ならず、「その他」の id とも重ならない", () => {
    const ids = NODE_SEPARATOR_PRESETS.map((preset) => preset.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(NODE_SEPARATOR_CUSTOM_ID);
  });

  it("分割の既定は「、」、統合の既定は半角スペースで、どちらもプリセットにある", () => {
    expect(SPLIT_DEFAULT_SEPARATOR).toBe("、");
    expect(MERGE_DEFAULT_SEPARATOR).toBe(" ");
    expect(NODE_SEPARATOR_PRESETS.map((preset) => preset.value)).toEqual(
      expect.arrayContaining([SPLIT_DEFAULT_SEPARATOR, MERGE_DEFAULT_SEPARATOR]),
    );
  });
});

describe("findSeparatorPresetId", () => {
  it.each([
    ["、", "ja-comma"],
    [",", "comma"],
    ["/", "slash"],
    ["・", "middle-dot"],
    [" ", "space"],
  ])("%j はプリセット %s", (separator, id) => {
    expect(findSeparatorPresetId(separator)).toBe(id);
  });

  it.each([
    ["空文字", ""],
    ["複数文字", "、、"],
    ["全角の読点とは別の全角コンマ", "，"],
    ["全角スペース", "　"],
  ])("%s はプリセットに一致せず「その他」（正規化しない）", (_name, separator) => {
    expect(findSeparatorPresetId(separator)).toBe(NODE_SEPARATOR_CUSTOM_ID);
  });
});

describe("resolveSeparator", () => {
  it("プリセットの id はその値を返し、入力欄の文字列は使わない", () => {
    expect(resolveSeparator("space", "ignored")).toBe(" ");
    expect(resolveSeparator("slash", "")).toBe("/");
  });

  it("「その他」は入力欄の文字列をそのまま返す（空のままなら空文字）", () => {
    expect(resolveSeparator(NODE_SEPARATOR_CUSTOM_ID, " -> ")).toBe(" -> ");
    expect(resolveSeparator(NODE_SEPARATOR_CUSTOM_ID, "")).toBe("");
  });

  it("知らない id は空文字を返す", () => {
    expect(resolveSeparator("unknown", "x")).toBe("");
  });
});
