import { ILLUSTRATED_NODE_HEIGHT } from "@/config/shapes";
import { areMapStatesEqual } from "@/domain/history/mapHistory";
import { isDocumentContentEqual } from "@/domain/mapLibrary/mapConflict";
import { NODE_ATTRIBUTE_POLICY, type OptionalNodeKey } from "@/domain/nodes/nodeAttributePolicy";
import { mergeNodes } from "@/domain/nodes/nodeMerge";
import { NODE_NOTE_MERGE_JOINER } from "@/domain/nodes/nodeNote";
import { createParentNode } from "@/domain/nodes/nodePlacement";
import { splitNode } from "@/domain/nodes/nodeSplit";
import { normalizeMapDocumentNode } from "@/domain/persistence/mapDocumentNode";
import { projectMapDocumentNode } from "@/domain/persistence/mapDocumentNodeProjection";
import { createTestNode } from "@/testing/createTestNode";
import { createJpegDataUrl } from "@/testing/jpegFixture";
import type { MapDocumentV3 } from "@/types/mapDocument";
import type { Node } from "@/types/node";

// 全属性を持つ見本のノード。Node に属性を足すと、ここで型エラーになる（見本の値を足し忘れない。L-825）。
// 値は保存形式の検証を通る値にする（イラストは寸法を宣言した JPEG、高さはイラスト付きの高さ）
const SAMPLE: Required<Node> = {
  id: 2,
  parentId: 1,
  x: 200,
  y: 40,
  width: 140,
  height: ILLUSTRATED_NODE_HEIGHT,
  label: "見本",
  importance: "high",
  illustration: createJpegDataUrl(100, 100),
  note: "見本のメモ",
  links: ["https://example.com/sample"],
  tags: ["見本"],
};

// 各属性を見本と別の値にしたもの（比較の付け忘れを検査する）。Node に属性を足すと、ここでも型エラーになる
const DIFFERENT: Required<Node> = {
  id: 3,
  parentId: null,
  x: 201,
  y: 41,
  width: 141,
  height: ILLUSTRATED_NODE_HEIGHT + 1,
  label: "別の見本",
  importance: "low",
  illustration: createJpegDataUrl(120, 120),
  note: "別のメモ",
  links: ["https://example.com/other"],
  tags: ["別の見本"],
};

const OPTIONAL_KEYS = Object.keys(NODE_ATTRIBUTE_POLICY) as OptionalNodeKey[];
const ALL_KEYS = Object.keys(SAMPLE) as (keyof Node)[];

const ROOT = createTestNode({ id: 1, label: "根" });

// key の項目を外したノード
function without(node: Node, key: OptionalNodeKey): Node {
  const copy: Node = { ...node };
  delete copy[key];
  return copy;
}

function documentOf(node: Node): MapDocumentV3 {
  return { version: 3, layoutMode: "manual", nodes: [node] };
}

// 表の merge の値ごとの、見本（残すノード）と別の値（吸収されるノード）を統合した値の期待。
// 連結の規則は domain/nodes/nodeMerge.ts（メモは NODE_NOTE_MERGE_JOINER、URL・タグは配列順で重複を除く）
function expectedMergedValue(key: OptionalNodeKey): unknown {
  const merge = NODE_ATTRIBUTE_POLICY[key].merge;
  switch (merge) {
    case "survivor-else-first":
      return SAMPLE[key];
    case "joined":
      return `${SAMPLE.note}${NODE_NOTE_MERGE_JOINER}${DIFFERENT.note}`;
    case "union":
      return [...(SAMPLE[key] as readonly string[]), ...(DIFFERENT[key] as readonly string[])];
    default: {
      const unreachable: never = merge;
      return unreachable;
    }
  }
}

describe("NODE_ATTRIBUTE_POLICY", () => {
  it("任意の属性（illustration・note・links・tags）だけを持つ", () => {
    expect([...OPTIONAL_KEYS].sort()).toEqual(["illustration", "links", "note", "tags"]);
  });
});

describe("表の振る舞いの検査（表を直さず属性の扱いを実装で変えると落ちる）", () => {
  it.each(OPTIONAL_KEYS)("split が original-only の %s は、分割の新しい断片が項目を持たず、元のノードが値を持ち続ける", (key) => {
    expect(NODE_ATTRIBUTE_POLICY[key].split).toBe("original-only");
    const nodes = [ROOT, { ...SAMPLE, label: "前、後" }];

    const result = splitNode(nodes, SAMPLE.id, "、", [101], new Set([1, 2]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodes.find((node) => node.id === SAMPLE.id)?.[key]).toEqual(SAMPLE[key]);
    expect(key in result.nodes.find((node) => node.id === 101)!).toBe(false);
  });

  it.each(OPTIONAL_KEYS)("parentInsert が none の %s は、親の挿入で作る新しい親が項目を持たない", (key) => {
    expect(NODE_ATTRIBUTE_POLICY[key].parentInsert).toBe("none");

    expect(key in createParentNode(SAMPLE, 50)).toBe(false);
  });

  it.each(OPTIONAL_KEYS)("merge の扱い（%s）は、残すノードが値を持たず吸収されるノードだけが持つ値を、統合後の残すノードに残す", (key) => {
    expect(["survivor-else-first", "joined", "union"]).toContain(NODE_ATTRIBUTE_POLICY[key].merge);
    // 残すノード（主選択）2 は key を持たず、吸収されるノード 3 だけが見本の値を持つ
    const survivor = without({ ...SAMPLE, label: "残す" }, key);
    const absorbed: Node = { ...createTestNode({ id: 3, parentId: 1, x: 200, y: 300, label: "吸収" }), [key]: SAMPLE[key] };
    const nodes = [ROOT, survivor, absorbed];

    const result = mergeNodes(nodes, [2, 3], 2, " ", new Set([1, 2, 3]), "manual");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodes.find((node) => node.id === 2)?.[key]).toEqual(SAMPLE[key]);
  });

  it.each(OPTIONAL_KEYS)("merge の扱い（%s）は、両方が値を持つとき、表の値（survivor-else-first・joined・union）のとおりに統合する", (key) => {
    // 残すノード（主選択）2 が見本の値、吸収されるノード 3 が別の値を持つ。配列順は 2、3
    const survivor: Node = { ...SAMPLE, label: "残す" };
    const absorbed: Node = { ...createTestNode({ id: 3, parentId: 1, x: 200, y: 300, label: "吸収" }), [key]: DIFFERENT[key] };
    const nodes = [ROOT, survivor, absorbed];

    const result = mergeNodes(nodes, [2, 3], 2, " ", new Set([1, 2, 3]), "manual");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodes.find((node) => node.id === 2)?.[key]).toEqual(expectedMergedValue(key));
  });
});

describe("全属性の往復と比較の検査（書き出し・読み込み・比較の付け忘れで落ちる）", () => {
  it("見本を書き出して（projectMapDocumentNode）V3 で読み込む（normalizeMapDocumentNode）と、見本と同じになる", () => {
    expect(normalizeMapDocumentNode(projectMapDocumentNode(SAMPLE), 0, 3)).toEqual({ ok: true, value: SAMPLE });
  });

  it.each(ALL_KEYS)("%s だけを別の値にすると、競合判定（isDocumentContentEqual）も履歴の同値判定（areMapStatesEqual）も違うとみなす", (key) => {
    const changed: Node = { ...SAMPLE, [key]: DIFFERENT[key] };

    expect(isDocumentContentEqual(documentOf(SAMPLE), documentOf(changed))).toBe(false);
    expect(areMapStatesEqual(documentOf(SAMPLE), documentOf(changed))).toBe(false);
  });

  it("同じ内容（別の配列）なら、競合判定も履歴の同値判定も同じとみなす", () => {
    const copy: Node = { ...SAMPLE, links: [...SAMPLE.links], tags: [...SAMPLE.tags] };

    expect(isDocumentContentEqual(documentOf(SAMPLE), documentOf(copy))).toBe(true);
    expect(areMapStatesEqual(documentOf(SAMPLE), documentOf(copy))).toBe(true);
  });
});
