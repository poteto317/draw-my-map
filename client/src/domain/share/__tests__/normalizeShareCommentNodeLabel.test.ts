import {
  normalizeShareCommentNodeLabel,
  SHARE_COMMENT_NODE_LABEL_FALLBACK,
} from "@/domain/share/normalizeShareCommentNodeLabel";
import { SHARE_COMMENT_NODE_LABEL_SNAPSHOT_MAX_CODE_POINTS } from "@/domain/share/shareCommentLimits";

describe("normalizeShareCommentNodeLabel", () => {
  it("代替文言は「（無題）」で上限は 80 コードポイント", () => {
    expect(SHARE_COMMENT_NODE_LABEL_FALLBACK).toBe("（無題）");
    expect(SHARE_COMMENT_NODE_LABEL_SNAPSHOT_MAX_CODE_POINTS).toBe(80);
  });

  it("改行（\\n・\\r）を空白にしてから制御文字を除く", () => {
    expect(normalizeShareCommentNodeLabel("行1\n行2\r行3\r\n行4")).toBe("行1 行2 行3  行4");
    expect(normalizeShareCommentNodeLabel("a\tb\u0000c\u007Fd\u0085e")).toBe("abcde");
  });

  it("前後の空白を除く", () => {
    expect(normalizeShareCommentNodeLabel("\n ラベル \n")).toBe("ラベル");
  });

  it("80 コードポイントで切り、サロゲートペアを割らない", () => {
    expect(normalizeShareCommentNodeLabel("b".repeat(100))).toBe("b".repeat(80));
    expect(normalizeShareCommentNodeLabel("😀".repeat(100))).toBe("😀".repeat(80));
  });

  it.each(["", "  ", "\n\r", "\u0007"])("%j は「（無題）」", (label) => {
    expect(normalizeShareCommentNodeLabel(label)).toBe(SHARE_COMMENT_NODE_LABEL_FALLBACK);
  });
});
