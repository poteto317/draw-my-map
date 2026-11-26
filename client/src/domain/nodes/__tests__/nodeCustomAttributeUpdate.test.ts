import { nodeTagKey } from "@/domain/nodes/nodeTag";
import {
  buildCustomAttributeFromDraft,
  computeNextCustomAttributes,
  findCustomAttributeIndex,
  formatCustomAttributeFailure,
  parseChoiceOptions,
} from "@/domain/nodes/nodeCustomAttributeUpdate";
import { MAX_CUSTOM_OPTIONS } from "@/domain/nodes/nodeTaskAttributes";
import type { NodeCustomAttribute } from "@/types/node";

const numberAttr: NodeCustomAttribute = { name: "件数", type: "number", value: 3 };
const dateAttr: NodeCustomAttribute = { name: "期限", type: "date", value: "2024-02-29" };
const choiceAttr: NodeCustomAttribute = {
  name: "区分",
  type: "choice",
  options: ["A", "B"],
  value: "A",
};

describe("parseChoiceOptions", () => {
  it("末尾改行1つを許容する", () => {
    expect(parseChoiceOptions("高\n中\n低\n")).toEqual({
      ok: true,
      value: ["高", "中", "低"],
    });
  });

  it("中間の空行と複数末尾改行を拒否する", () => {
    expect(parseChoiceOptions("高\n\n低").ok).toBe(false);
    expect(parseChoiceOptions("高\n低\n\n").ok).toBe(false);
  });

  it(`${MAX_CUSTOM_OPTIONS + 1} 行以上の候補を拒否する`, () => {
    const input = Array.from({ length: MAX_CUSTOM_OPTIONS + 1 }, (_, index) => `候補${index}`).join("\n");
    expect(parseChoiceOptions(input)).toEqual({ ok: false, reason: "too-many-options" });
  });
});

describe("computeNextCustomAttributes", () => {
  it("追加は末尾に置く", () => {
    const result = computeNextCustomAttributes([numberAttr], null, null, dateAttr);
    expect(result).toEqual({ ok: true, value: [numberAttr, dateAttr] });
  });

  it("同名の追加と10件超過を拒否する", () => {
    expect(computeNextCustomAttributes([numberAttr], null, null, numberAttr).ok).toBe(false);
    const full = Array.from({ length: 10 }, (_, index) => ({
      name: `属性${index}`,
      type: "number" as const,
      value: index,
    }));
    expect(computeNextCustomAttributes(full, null, null, dateAttr).ok).toBe(false);
  });

  it("改名時は自分自身を重複判定から除く", () => {
    const renamed = { ...numberAttr, name: "数量" };
    const result = computeNextCustomAttributes(
      [numberAttr, dateAttr],
      nodeTagKey(numberAttr.name),
      numberAttr,
      renamed,
    );
    expect(result).toEqual({ ok: true, value: [renamed, dateAttr] });
  });

  it("全角と半角が同じ鍵になる改名を反映する", () => {
    const renamed = { ...numberAttr, name: "ＡＢＣ" };
    const result = computeNextCustomAttributes(
      [{ name: "abc", type: "number", value: 1 }],
      nodeTagKey("abc"),
      { name: "abc", type: "number", value: 1 },
      renamed,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value?.[0]?.name).toBe("ＡＢＣ");
  });

  it("編集は元位置を保ち、削除は1件だけ外す", () => {
    const edited = { ...choiceAttr, value: "B" };
    expect(
      computeNextCustomAttributes(
        [numberAttr, choiceAttr, dateAttr],
        nodeTagKey(choiceAttr.name),
        choiceAttr,
        edited,
      ),
    ).toEqual({ ok: true, value: [numberAttr, edited, dateAttr] });

    expect(
      computeNextCustomAttributes(
        [numberAttr, choiceAttr],
        nodeTagKey(choiceAttr.name),
        choiceAttr,
        null,
      ),
    ).toEqual({ ok: true, value: [numberAttr] });
  });

  it("元の構造値が一致しない削除と編集を拒否する", () => {
    expect(
      computeNextCustomAttributes(
        [choiceAttr],
        nodeTagKey(choiceAttr.name),
        { ...choiceAttr, value: "B" },
        null,
      ).ok,
    ).toBe(false);
    expect(
      computeNextCustomAttributes(
        [numberAttr],
        nodeTagKey(numberAttr.name),
        dateAttr,
        { ...numberAttr, value: 9 },
      ).ok,
    ).toBe(false);
  });
});

describe("findCustomAttributeIndex", () => {
  it("名前鍵で位置を返す", () => {
    expect(findCustomAttributeIndex([numberAttr, dateAttr], nodeTagKey(dateAttr.name))).toBe(1);
  });
});

describe("buildCustomAttributeFromDraft", () => {
  it("フォーム下書きから属性を組み立てる", () => {
    expect(buildCustomAttributeFromDraft({
      type: "number",
      name: "件数",
      numberValue: "12",
      dateValue: "",
      choiceOptions: "",
      choiceValue: "",
    })).toEqual({ ok: true, value: { name: "件数", type: "number", value: 12 } });
  });

  it("11件超の選択肢候補で選択肢上限の文言を返す", () => {
    const choiceOptions = Array.from({ length: MAX_CUSTOM_OPTIONS + 1 }, (_, index) => `候補${index}`).join("\n");
    const result = buildCustomAttributeFromDraft({
      type: "choice",
      name: "区分",
      numberValue: "",
      dateValue: "",
      choiceOptions,
      choiceValue: "候補0",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("選択肢");
      expect(result.reason).not.toContain("カスタム属性は 1 つのノードに");
    }
  });
});

describe("formatCustomAttributeFailure", () => {
  it("失敗理由を日本語にする", () => {
    expect(formatCustomAttributeFailure("duplicate")).toContain("同じ名前");
    expect(formatCustomAttributeFailure("not-an-option")).toContain("候補");
    expect(formatCustomAttributeFailure("too-many")).toContain("カスタム属性");
    expect(formatCustomAttributeFailure("too-many-options")).toContain("選択肢");
    expect(formatCustomAttributeFailure("too-many-options")).not.toContain("カスタム属性は 1 つのノードに");
  });
});