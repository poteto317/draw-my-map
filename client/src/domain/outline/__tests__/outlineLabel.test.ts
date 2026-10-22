import { extractOutlineLabel } from "../outlineLabel";
import { isBlankOutlineRest, normalizeOutlineRest } from "../outlineLines";

jest.mock("../outlineLines", () => {
  const actual = jest.requireActual("../outlineLines");
  return {
    ...actual,
    normalizeOutlineRest: jest.fn(actual.normalizeOutlineRest),
  };
});

describe("extractOutlineLabel", () => {
  it.each([
    ["- 果物", "果物"],
    ["* a", "a"],
    ["+ a", "a"],
    ["\u30FB朝", "朝"],
    ["\u2022昼", "昼"],
    ["\u30FB 朝", "朝"],
    ["1. 準備", "準備"],
    ["2) 実行", "実行"],
    ["123456789. a", "a"],
    ["-\u3000a", "a"],
    ["- 1. 手順", "1. 手順"],
    ["\u30FB- a", "- a"],
  ])("記号と番号を1つだけ取り除く: %j", (rest, label) => {
    expect(extractOutlineLabel(rest)).toEqual({ kind: "label", label });
  });

  it.each([
    ["-5度", "-5度"],
    ["+1", "+1"],
    ["*注意*", "*注意*"],
    ["-項目", "-項目"],
    ["3.14", "3.14"],
    ["1.5倍", "1.5倍"],
    ["2026.10", "2026.10"],
    ["1234567890. a", "1234567890. a"],
    ["１．全角", "１．全角"],
    ["①丸", "①丸"],
    ["(1) 括弧", "(1) 括弧"],
    ["◦ a", "◦ a"],
    ["■ a", "■ a"],
    ["○ a", "○ a"],
    ["‣ a", "‣ a"],
    ["# 見出し", "# 見出し"],
    ["- [ ] タスク", "[ ] タスク"],
    ["> 引用", "> 引用"],
  ])("取り除かない記号はラベルに残す: %j", (rest, label) => {
    expect(extractOutlineLabel(rest)).toEqual({ kind: "label", label });
  });

  it.each(["-", "*", "+", "\u30FB", "\u2022", "1.", "12)", "-   "])(
    "記号だけの行はmarker-onlyにする: %j",
    (rest) => {
      expect(extractOutlineLabel(rest)).toEqual({ kind: "marker-only" });
    },
  );

  it.each(["", "   ", "\u0007"])("空行はblankにする: %j", (rest) => {
    expect(extractOutlineLabel(rest)).toEqual({ kind: "blank" });
  });

  it.each([
    ["A\tB", "A B"],
    ["  - a  ", "a"],
    ["-\ta", "a"],
    ["\u200B", "\u200B"],
  ])("制御文字と前後の空白を整えてから記号を判定する: %j", (rest, label) => {
    expect(extractOutlineLabel(rest)).toEqual({ kind: "label", label });
  });

  it.each(["", "   ", "　", "\u0007", "\u007F", "\t", "-", "・", "a", "​"])(
    "blankになるのはisBlankOutlineRestが空行とみなす残りだけ: %j",
    (rest) => {
      expect(extractOutlineLabel(rest).kind === "blank").toBe(isBlankOutlineRest(rest));
    },
  );

  it("手順1・2をnormalizeOutlineRestで行う", () => {
    const spy = jest.mocked(normalizeOutlineRest);
    spy.mockClear();

    extractOutlineLabel("a");

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
