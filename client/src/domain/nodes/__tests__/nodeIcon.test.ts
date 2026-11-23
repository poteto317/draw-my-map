import {
  applyProjectedNodeIcon,
  getNodeIconCenterX,
  isAcceptableNodeIcon,
  NODE_ICON_DISPLAY_SIZE_PX,
  NODE_ICON_LABEL_GAP,
  normalizeNodeIcon,
  projectNodeIcon,
  resolveNodeIconDraft,
} from "@/domain/nodes/nodeIcon";
import { createTestNode } from "@/testing/createTestNode";

describe("isAcceptableNodeIcon / normalizeNodeIcon", () => {
  it("Extended_Pictographic を含む 1 書記素は受理する", () => {
    expect(isAcceptableNodeIcon("😀")).toBe(true);
    expect(normalizeNodeIcon("😀")).toBe("😀");
    // ZWJ 結合（書記素1・CP≤16）
    expect(isAcceptableNodeIcon("👨‍👩‍👧")).toBe(true);
    expect(normalizeNodeIcon("👨‍👩‍👧")).toBe("👨‍👩‍👧");
  });

  it("ラテン1書記素は Extended_Pictographic が無いので拒否する", () => {
    expect(isAcceptableNodeIcon("A")).toBe(false);
    expect(normalizeNodeIcon("A")).toBeUndefined();
    expect(isAcceptableNodeIcon("あ")).toBe(false);
    expect(normalizeNodeIcon("あ")).toBeUndefined();
  });

  it("書記素2つ以上は拒否する", () => {
    expect(isAcceptableNodeIcon("😀😀")).toBe(false);
    expect(normalizeNodeIcon("😀😀")).toBeUndefined();
    expect(isAcceptableNodeIcon("AB")).toBe(false);
  });

  it("空・非文字列は拒否する", () => {
    expect(isAcceptableNodeIcon("")).toBe(false);
    expect(normalizeNodeIcon("")).toBeUndefined();
    expect(normalizeNodeIcon(undefined)).toBeUndefined();
    expect(normalizeNodeIcon(1)).toBeUndefined();
    expect(normalizeNodeIcon(null)).toBeUndefined();
  });

  it("コードポイント17超の1書記素は拒否する", () => {
    // 絵文字ベース + 結合記号を重ねて CP 数を17以上にする
    const over = `😀${"\u0301".repeat(16)}`;
    expect([...over].length).toBeGreaterThanOrEqual(17);
    expect(isAcceptableNodeIcon(over)).toBe(false);
    expect(normalizeNodeIcon(over)).toBeUndefined();
  });
});

describe("projectNodeIcon", () => {
  it("受理できる icon だけを書き出し、欠落・不正はキー省略する", () => {
    expect(projectNodeIcon({ icon: "🎯" })).toEqual({ icon: "🎯" });
    expect(projectNodeIcon({})).toEqual({});
    expect(projectNodeIcon({ icon: undefined })).toEqual({});
    expect(projectNodeIcon({ icon: "A" })).toEqual({});
    expect(projectNodeIcon({ icon: "😀😀" })).toEqual({});
  });
});

describe("applyProjectedNodeIcon", () => {
  it("不正・クリアでキーを外し、他属性は保つ", () => {
    const node = createTestNode({
      id: 1,
      icon: "😀",
      kind: "question",
      labelBold: true,
    });

    expect(applyProjectedNodeIcon(node, "A")).toEqual({
      ...createTestNode({ id: 1, kind: "question", labelBold: true }),
    });
    expect("icon" in applyProjectedNodeIcon(node, undefined)).toBe(false);
  });
});

describe("getNodeIconCenterX", () => {
  it("ラベル中心と幅から icon 中心 X を返す（ギャップと半サイズを引く）", () => {
    expect(getNodeIconCenterX(100, 80)).toBe(
      100 - 80 / 2 - NODE_ICON_LABEL_GAP - NODE_ICON_DISPLAY_SIZE_PX / 2,
    );
    expect(NODE_ICON_LABEL_GAP).toBe(4);
    expect(NODE_ICON_DISPLAY_SIZE_PX).toBe(16);
  });
});

describe("resolveNodeIconDraft", () => {
  it("空・空白のみはクリア（undefined）", () => {
    expect(resolveNodeIconDraft("")).toEqual({ ok: true, icon: undefined });
    expect(resolveNodeIconDraft("   ")).toEqual({ ok: true, icon: undefined });
  });

  it("受理できる絵文字は trim して返す", () => {
    expect(resolveNodeIconDraft(" 🔥 ")).toEqual({ ok: true, icon: "🔥" });
  });

  it("受理できない入力は失敗", () => {
    expect(resolveNodeIconDraft("A")).toEqual({ ok: false });
    expect(resolveNodeIconDraft("😀😀")).toEqual({ ok: false });
  });
});
