import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FALLBACK_NODE_LABEL } from "@/config/nodeLabel";
import {
  ILLUSTRATED_NODE_HEIGHT,
  ILLUSTRATION_AREA_HEIGHT,
  RECT_HEIGHT,
  RECT_WIDTH,
} from "@/config/shapes";
import { truncateLabelByCodePoints } from "@/domain/nodes/nodeDisplayLabel";
import {
  NODE_LABEL_CONTENT_MAX_HEIGHT,
  NODE_LABEL_HORIZONTAL_PADDING,
  NODE_LABEL_VERTICAL_PADDING,
  anyNodeHeightsChanged,
  ellipsizeWrappedLabel,
  fittedHeightForLabel,
  fitNodeHeightToLabel,
  fitNodeHeightToLabelIfContentChanged,
  fitNodesHeightToLabels,
  measureWrappedLabelBodyHeight,
  nodeLabelContentHeightBudget,
  type FitMode,
} from "@/domain/nodes/nodeLabelLayout";
import { createTestNode } from "@/testing/createTestNode";

const CONTENT_WIDTH = RECT_WIDTH - NODE_LABEL_HORIZONTAL_PADDING;
const FONT_SIZE = 14;
/** 折り返しで複数行になる十分な長さのラベル（CJK・空白なし） */
const LONG_WRAPPING_LABEL = "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん";
/** 本文上限を超えて省略が必要な長さ */
const OVERFLOW_LABEL = LONG_WRAPPING_LABEL.repeat(8);

describe("nodeLabelLayout constants", () => {
  it("水平・垂直パディングは 16、本文上限は 224", () => {
    expect(NODE_LABEL_HORIZONTAL_PADDING).toBe(16);
    expect(NODE_LABEL_VERTICAL_PADDING).toBe(16);
    expect(NODE_LABEL_CONTENT_MAX_HEIGHT).toBe(224);
    expect(NODE_LABEL_CONTENT_MAX_HEIGHT).toBe(RECT_HEIGHT * 4 - NODE_LABEL_VERTICAL_PADDING);
  });
});

describe("measureWrappedLabelBodyHeight", () => {
  it("短いラベルは1行分の高さ", () => {
    const height = measureWrappedLabelBodyHeight({
      text: "短い",
      fontSize: FONT_SIZE,
      contentWidth: CONTENT_WIDTH,
    });
    expect(height).toBeGreaterThan(0);
    expect(height).toBeLessThanOrEqual(FONT_SIZE * 2);
  });

  it("長い折り返しラベルは短いラベルより高い", () => {
    const shortHeight = measureWrappedLabelBodyHeight({
      text: "短い",
      fontSize: FONT_SIZE,
      contentWidth: CONTENT_WIDTH,
    });
    const longHeight = measureWrappedLabelBodyHeight({
      text: LONG_WRAPPING_LABEL,
      fontSize: FONT_SIZE,
      contentWidth: CONTENT_WIDTH,
    });
    expect(longHeight).toBeGreaterThan(shortHeight);
  });

  it("全角1文字幅の累積で contentWidth ちょうどに折り返す（線形 wrap）", () => {
    const charsPerLine = Math.floor(CONTENT_WIDTH / FONT_SIZE);
    expect(charsPerLine).toBeGreaterThan(1);
    const lineHeight = FONT_SIZE * (18 / 14);
    const text = "あ".repeat(charsPerLine * 3 + 2);
    const height = measureWrappedLabelBodyHeight({
      text,
      fontSize: FONT_SIZE,
      contentWidth: CONTENT_WIDTH,
    });
    expect(height).toBe(4 * lineHeight);
  });

  it("ASCII 混在でも幅累積で折り返し、空行と明示改行を保つ", () => {
    const lineHeight = FONT_SIZE * (18 / 14);
    const height = measureWrappedLabelBodyHeight({
      text: "abc\n\nあいうえおかきくけこ",
      fontSize: FONT_SIZE,
      contentWidth: CONTENT_WIDTH,
    });
    expect(height).toBeGreaterThanOrEqual(3 * lineHeight);
  });

  it("空文字は getNodeDisplayLabel 相当で計測する", () => {
    const emptyHeight = measureWrappedLabelBodyHeight({
      text: "",
      fontSize: FONT_SIZE,
      contentWidth: CONTENT_WIDTH,
    });
    const fallbackHeight = measureWrappedLabelBodyHeight({
      text: FALLBACK_NODE_LABEL,
      fontSize: FONT_SIZE,
      contentWidth: CONTENT_WIDTH,
    });
    expect(emptyHeight).toBe(fallbackHeight);
  });
});

describe("ellipsizeWrappedLabel", () => {
  it("上限内なら省略せず domain wrap 結果を返す", () => {
    const result = ellipsizeWrappedLabel({
      text: "短いラベル",
      fontSize: FONT_SIZE,
      contentWidth: CONTENT_WIDTH,
      maxContentHeight: NODE_LABEL_CONTENT_MAX_HEIGHT,
    });
    expect(result).toEqual({ text: "短いラベル", truncated: false });
    expect(result.text.includes("…")).toBe(false);
  });

  it("上限内の長文も domain wrap の改行を含み truncated:false", () => {
    const result = ellipsizeWrappedLabel({
      text: LONG_WRAPPING_LABEL,
      fontSize: FONT_SIZE,
      contentWidth: CONTENT_WIDTH,
      maxContentHeight: NODE_LABEL_CONTENT_MAX_HEIGHT,
    });
    expect(result.truncated).toBe(false);
    expect(result.text.includes("\n")).toBe(true);
    expect(result.text.includes("…")).toBe(false);
  });

  it("上限超過は行単位で切り末尾に…を付け truncated:true", () => {
    const result = ellipsizeWrappedLabel({
      text: OVERFLOW_LABEL,
      fontSize: FONT_SIZE,
      contentWidth: CONTENT_WIDTH,
      maxContentHeight: NODE_LABEL_CONTENT_MAX_HEIGHT,
    });
    expect(result.truncated).toBe(true);
    expect(result.text.endsWith("…")).toBe(true);
    // … 付与後も再 wrap で行が増えず、本文高さは上限以内
    expect(
      measureWrappedLabelBodyHeight({
        text: result.text,
        fontSize: FONT_SIZE,
        contentWidth: CONTENT_WIDTH,
      }),
    ).toBeLessThanOrEqual(NODE_LABEL_CONTENT_MAX_HEIGHT);
  });

  it("空文字は getNodeDisplayLabel の結果を返す", () => {
    expect(
      ellipsizeWrappedLabel({
        text: "",
        fontSize: FONT_SIZE,
        contentWidth: CONTENT_WIDTH,
        maxContentHeight: NODE_LABEL_CONTENT_MAX_HEIGHT,
      }),
    ).toEqual({ text: FALLBACK_NODE_LABEL, truncated: false });
  });

  it("codePoints 単独切断ではなく行単位省略である", () => {
    const maxContentHeight = FONT_SIZE * 3; // ごく低い上限で複数行を切る
    const wrapped = ellipsizeWrappedLabel({
      text: LONG_WRAPPING_LABEL,
      fontSize: FONT_SIZE,
      contentWidth: CONTENT_WIDTH,
      maxContentHeight,
    });
    const byCodePoints = truncateLabelByCodePoints(LONG_WRAPPING_LABEL, 8);
    expect(wrapped.text).not.toBe(byCodePoints);
    expect(wrapped.truncated).toBe(true);
    expect(wrapped.text.endsWith("…")).toBe(true);
  });
});

describe("fittedHeightForLabel", () => {
  it("ダミー Node なしで fitNodeHeightToLabel(commit) と同じ高さ", () => {
    const label = LONG_WRAPPING_LABEL;
    const viaNode = fitNodeHeightToLabel(
      createTestNode({ label, width: RECT_WIDTH, height: RECT_HEIGHT }),
      "commit",
    ).height;
    expect(fittedHeightForLabel(label)).toBe(viaNode);
  });
});

describe("fitNodeHeightToLabel", () => {
  it("短いラベルは RECT_HEIGHT", () => {
    const node = createTestNode({ label: "短い", height: RECT_HEIGHT });
    const fitted = fitNodeHeightToLabel(node, "commit");
    expect(fitted.height).toBe(RECT_HEIGHT);
    expect(fitted.width).toBe(node.width);
  });

  it("長い折り返しは高さが増える", () => {
    const node = createTestNode({ label: LONG_WRAPPING_LABEL, height: RECT_HEIGHT });
    const fitted = fitNodeHeightToLabel(node, "commit");
    expect(fitted.height).toBeGreaterThan(RECT_HEIGHT);
    expect(fitted.height).toBeLessThanOrEqual(RECT_HEIGHT * 4);
  });

  it("上限超過はイラスト無しで高さ 240 に頭打ち", () => {
    const node = createTestNode({ label: OVERFLOW_LABEL, height: RECT_HEIGHT });
    const fitted = fitNodeHeightToLabel(node, "commit");
    expect(fitted.height).toBe(RECT_HEIGHT * 4);
  });

  it("commit は長い→短いへ確定すると下限まで縮小する", () => {
    const tall = createTestNode({ label: LONG_WRAPPING_LABEL, height: 180 });
    const afterLong = fitNodeHeightToLabel(tall, "commit");
    expect(afterLong.height).toBeGreaterThan(RECT_HEIGHT);

    const short = { ...afterLong, label: "短い" };
    const afterShort = fitNodeHeightToLabel(short, "commit");
    expect(afterShort.height).toBe(RECT_HEIGHT);
  });

  it("growOnly は縮小しない", () => {
    const node = createTestNode({ label: "短い", height: 180 });
    const fitted = fitNodeHeightToLabel(node, "growOnly");
    expect(fitted.height).toBe(180);
  });

  it("growOnly は不足時だけ増高する", () => {
    const node = createTestNode({ label: LONG_WRAPPING_LABEL, height: RECT_HEIGHT });
    const fitted = fitNodeHeightToLabel(node, "growOnly");
    expect(fitted.height).toBeGreaterThan(RECT_HEIGHT);
  });

  it("イラスト有りは下限 ILLUSTRATED_NODE_HEIGHT・上限 296", () => {
    const short = createTestNode({
      label: "短い",
      height: RECT_HEIGHT,
      illustration: "data:image/png;base64,xx",
    });
    const shortFitted = fitNodeHeightToLabel(short, "commit");
    expect(shortFitted.height).toBe(ILLUSTRATED_NODE_HEIGHT);

    const overflow = createTestNode({
      label: OVERFLOW_LABEL,
      height: ILLUSTRATED_NODE_HEIGHT,
      illustration: "data:image/png;base64,xx",
    });
    const overflowFitted = fitNodeHeightToLabel(overflow, "commit");
    expect(overflowFitted.height).toBe(
      NODE_LABEL_CONTENT_MAX_HEIGHT + NODE_LABEL_VERTICAL_PADDING + ILLUSTRATION_AREA_HEIGHT,
    );
    expect(overflowFitted.height).toBe(296);
  });

  it("空ラベルは getNodeDisplayLabel で計測し下限高さになる", () => {
    const empty = createTestNode({ label: "", height: 200 });
    const fitted = fitNodeHeightToLabel(empty, "commit");
    const withFallback = fitNodeHeightToLabel(
      createTestNode({ label: FALLBACK_NODE_LABEL, height: 200 }),
      "commit",
    );
    expect(fitted.height).toBe(withFallback.height);
    expect(fitted.height).toBe(RECT_HEIGHT);
  });

  it.each(["commit", "growOnly"] as const satisfies readonly FitMode[])(
    "mode=%s で x,y,width は不変",
    (mode) => {
      const node = createTestNode({
        x: 12,
        y: 34,
        width: 100,
        label: LONG_WRAPPING_LABEL,
        height: RECT_HEIGHT,
      });
      const fitted = fitNodeHeightToLabel(node, mode);
      expect(fitted.x).toBe(12);
      expect(fitted.y).toBe(34);
      expect(fitted.width).toBe(100);
    },
  );

  it.each([0, -1] as const)(
    "不正 height=%s は fit せず参照同一のまま返す",
    (height) => {
      const node = createTestNode({ label: LONG_WRAPPING_LABEL, height });
      expect(fitNodeHeightToLabel(node, "commit")).toBe(node);
      expect(fitNodeHeightToLabel(node, "growOnly")).toBe(node);
    },
  );
});

describe("fitNodeHeightToLabelIfContentChanged", () => {
  it("新規ノードは fit する", () => {
    const node = createTestNode({ label: LONG_WRAPPING_LABEL, height: RECT_HEIGHT });
    const fitted = fitNodeHeightToLabelIfContentChanged(undefined, node, "commit");
    expect(fitted.height).toBeGreaterThan(RECT_HEIGHT);
  });

  it("label / illustration / fontSize が同じなら触らない", () => {
    const previous = createTestNode({ label: "短い", height: 200 });
    const next = { ...previous };
    expect(fitNodeHeightToLabelIfContentChanged(previous, next, "commit")).toBe(next);
  });

  it("label が変わったら fit する", () => {
    const previous = createTestNode({ label: "短い", height: RECT_HEIGHT });
    const next = { ...previous, label: LONG_WRAPPING_LABEL };
    const fitted = fitNodeHeightToLabelIfContentChanged(previous, next, "commit");
    expect(fitted.height).toBeGreaterThan(RECT_HEIGHT);
  });
});

describe("nodeLabelContentHeightBudget", () => {
  it("イラスト無しは height - 垂直パディング", () => {
    const node = createTestNode({ height: 120 });
    expect(nodeLabelContentHeightBudget(node)).toBe(120 - NODE_LABEL_VERTICAL_PADDING);
  });

  it("イラスト有りは illustration 領域も差し引く", () => {
    const node = createTestNode({
      height: 200,
      illustration: "data:image/png;base64,xx",
    });
    expect(nodeLabelContentHeightBudget(node)).toBe(
      200 - NODE_LABEL_VERTICAL_PADDING - ILLUSTRATION_AREA_HEIGHT,
    );
  });
});

describe("fitNodesHeightToLabels", () => {
  it("各ノードへ fit を適用する", () => {
    const nodes = [
      createTestNode({ id: 1, label: "短い", height: 200 }),
      createTestNode({ id: 2, label: LONG_WRAPPING_LABEL, height: RECT_HEIGHT }),
    ];
    const fitted = fitNodesHeightToLabels(nodes, "commit");
    expect(fitted[0].height).toBe(RECT_HEIGHT);
    expect(fitted[1].height).toBeGreaterThan(RECT_HEIGHT);
  });

  it("growOnly はどのノードも縮小しない", () => {
    const nodes = [
      createTestNode({ id: 1, label: "短い", height: 200 }),
      createTestNode({ id: 2, label: "短い", height: RECT_HEIGHT }),
    ];
    const fitted = fitNodesHeightToLabels(nodes, "growOnly");
    expect(fitted[0].height).toBe(200);
    expect(fitted[1].height).toBe(RECT_HEIGHT);
  });
});

describe("anyNodeHeightsChanged", () => {
  it("同一高さなら false、1件でも変われば true", () => {
    const previous = [
      createTestNode({ id: 1, height: RECT_HEIGHT }),
      createTestNode({ id: 2, height: 120 }),
    ];
    expect(anyNodeHeightsChanged(previous, previous)).toBe(false);
    expect(
      anyNodeHeightsChanged(previous, [
        previous[0]!,
        { ...previous[1]!, height: 180 },
      ]),
    ).toBe(true);
  });
});

describe("純関数契約", () => {
  it("pixi を import しない", () => {
    const source = readFileSync(
      resolve(__dirname, "../nodeLabelLayout.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+["'][^"']*pixi/i);
    expect(source).not.toMatch(/require\(["'][^"']*pixi/i);
  });

  it("同じ入力で同じ高さを返す（決定的）", () => {
    const input = {
      text: LONG_WRAPPING_LABEL,
      fontSize: FONT_SIZE,
      contentWidth: CONTENT_WIDTH,
    };
    expect(measureWrappedLabelBodyHeight(input)).toBe(
      measureWrappedLabelBodyHeight(input),
    );
  });
});
