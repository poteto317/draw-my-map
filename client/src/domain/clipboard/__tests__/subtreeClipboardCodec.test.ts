import {
  decodeSubtreeClipboard,
  encodeSubtreeClipboard,
  MAX_SUBTREE_CLIPBOARD_LENGTH,
  MAX_SUBTREE_CLIPBOARD_NODES,
  validateSubtreeClipboardNodes,
} from "@/domain/clipboard/subtreeClipboardCodec";
import { parseMapDocumentJson } from "@/domain/persistence/mapDocumentDecoder";
import { createTestNode } from "@/testing/createTestNode";
import { createJpegDataUrl } from "@/testing/jpegFixture";
import type { Node } from "@/types/node";

const IMAGE = createJpegDataUrl(128, 128);
const TYPE = "draw-my-map/subtree";

function node(id: number, parentId: number | null, overrides: Partial<Node> = {}): Node {
  return createTestNode({ id, parentId, x: id * 10, y: id * 20, label: `n${id}`, ...overrides });
}

function clipboardText(nodes: readonly unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ type: TYPE, version: 1, nodes, ...extra });
}

function encodeAndDecode(nodes: readonly Node[], sourceId: number) {
  const text = encodeSubtreeClipboard(nodes, sourceId);
  if (!text.ok) throw new Error(`encode failed: ${text.reason}`);
  return decodeSubtreeClipboard(text.value);
}

describe("encodeSubtreeClipboard / decodeSubtreeClipboard", () => {
  // 子が親より前に並ぶ配列。1 が全体の根、3 がコピー元、7 は別の枝
  const map: Node[] = [
    node(6, 5, { importance: "low", illustration: IMAGE, height: 120, width: 140 }),
    node(5, 4),
    node(7, 1),
    node(4, 3, { importance: "high", label: "深い枝" }),
    node(8, 3),
    node(1, null),
    node(3, 2),
    node(2, 1),
  ];

  it("親を持つノードと全子孫だけを、根を切り離して往復させる", () => {
    const before = JSON.parse(JSON.stringify(map)) as Node[];

    const decoded = encodeAndDecode(map, 3);

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.rootId).toBe(3);
    expect(decoded.value.nodes).toEqual([
      map[0],
      map[1],
      map[3],
      map[4],
      { ...map[6], parentId: null },
    ]);
    expect(decoded.value.nodes.filter((current) => current.parentId === null)).toHaveLength(1);
    expect(decoded.value.nodes.find((current) => current.id === 3)?.parentId).toBeNull();
    expect(map).toEqual(before);
  });

  it("葉を単独でコピーできる", () => {
    const decoded = encodeAndDecode(map, 6);

    expect(decoded).toEqual({
      ok: true,
      value: { rootId: 6, nodes: [{ ...map[0], parentId: null }] },
    });
  });

  it("専用の形式で書き出し、元の配列にない項目を持ち込まない", () => {
    const source = [{ ...node(1, null), extra: "x" } as Node];

    const text = encodeSubtreeClipboard(source, 1);

    expect(text).toEqual({
      ok: true,
      value: clipboardText([{ id: 1, parentId: null, x: 10, y: 20, width: 100, height: 60, label: "n1", importance: "medium" }]),
    });
  });

  it("存在しないsourceIdはinvalid", () => {
    expect(encodeSubtreeClipboard(map, 99)).toEqual({ ok: false, reason: "invalid" });
    expect(encodeSubtreeClipboard([], 1)).toEqual({ ok: false, reason: "invalid" });
  });

  it.each([
    ["非有限の座標", { x: Infinity }],
    ["不正な寸法", { width: 0 }],
    ["不正な画像", { illustration: "data:image/png;base64,AAAA" }],
  ])("コピー元の%sはinvalidにする", (_, overrides) => {
    expect(encodeSubtreeClipboard([node(1, null), node(2, 1, overrides)], 1)).toEqual({ ok: false, reason: "invalid" });
  });

  it("コピー元の部分木の重複IDはinvalidにする", () => {
    expect(encodeSubtreeClipboard([node(1, null), node(2, 1), node(2, 1)], 1)).toEqual({ ok: false, reason: "invalid" });
  });

  it("ノード数が上限ちょうどならコピーでき、1件超えるとtoo-large", () => {
    const chain = (count: number) => Array.from({ length: count }, (_, index) => (
      createTestNode({ id: index + 1, parentId: index === 0 ? null : index })
    ));

    expect(encodeSubtreeClipboard(chain(MAX_SUBTREE_CLIPBOARD_NODES), 1).ok).toBe(true);
    expect(encodeSubtreeClipboard(chain(MAX_SUBTREE_CLIPBOARD_NODES + 1), 1)).toEqual({ ok: false, reason: "too-large" });
  });

  it("書き出したテキストが文字数の上限ちょうどならコピーでき、1文字超えるとtoo-large", () => {
    const base = encodeSubtreeClipboard([createTestNode({ label: "" })], 1);
    if (!base.ok) throw new Error("base encode failed");
    const padding = MAX_SUBTREE_CLIPBOARD_LENGTH - base.value.length;

    const exact = encodeSubtreeClipboard([createTestNode({ label: "a".repeat(padding) })], 1);
    expect(exact.ok && exact.value.length).toBe(MAX_SUBTREE_CLIPBOARD_LENGTH);
    expect(encodeSubtreeClipboard([createTestNode({ label: "a".repeat(padding + 1) })], 1)).toEqual({ ok: false, reason: "too-large" });
  });
});

describe("decodeSubtreeClipboard", () => {
  const valid = { id: 1, parentId: null, x: 0, y: 0, width: 100, height: 60, label: "a", importance: "medium" };

  it("未知のプロパティを持ち込まない", () => {
    const decoded = decodeSubtreeClipboard(clipboardText([{ ...valid, extra: 1 }], { rootId: 1 }));

    expect(decoded).toEqual({ ok: true, value: { rootId: 1, nodes: [valid] } });
    expect(decoded.ok && "extra" in decoded.value.nodes[0]).toBe(false);
  });

  it("画像の高さ補正は既存のV3と一致する", () => {
    const withImage = { ...valid, height: 60, illustration: IMAGE };
    const decoded = decodeSubtreeClipboard(clipboardText([withImage]));
    const document = parseMapDocumentJson(JSON.stringify({ version: 3, layoutMode: "manual", nodes: [withImage] }));

    expect(document.ok).toBe(true);
    expect(decoded.ok && document.ok && decoded.value.nodes).toEqual(document.ok && document.value.nodes);
    expect(decoded.ok && decoded.value.nodes[0].height).toBeGreaterThan(60);
  });

  it.each([
    ["通常のテキスト", "枝のラベル"],
    ["壊れたJSON", "{"],
    ["JSONの配列", "[]"],
    ["JSONのnull", "null"],
    ["通常のV3マップ", JSON.stringify({ version: 3, layoutMode: "manual", nodes: [valid] })],
    ["未知のtype", JSON.stringify({ type: "other", version: 1, nodes: [valid] })],
    ["未知のversion", JSON.stringify({ type: TYPE, version: 2, nodes: [valid] })],
    ["nodesが配列でない", JSON.stringify({ type: TYPE, version: 1, nodes: {} })],
    ["空のnodes", clipboardText([])],
    ["根が無い", clipboardText([{ ...valid, parentId: 2 }, { ...valid, id: 2, parentId: 1 }])],
    ["複数の根", clipboardText([valid, { ...valid, id: 2 }])],
    ["循環", clipboardText([valid, { ...valid, id: 2, parentId: 3 }, { ...valid, id: 3, parentId: 2 }])],
    ["孤児", clipboardText([valid, { ...valid, id: 2, parentId: 99 }])],
    ["重複ID", clipboardText([valid, { ...valid, parentId: 1 }])],
    ["不正な画像", clipboardText([{ ...valid, illustration: "data:image/png;base64,AAAA" }])],
    ["不正な寸法", clipboardText([{ ...valid, height: 0 }])],
    ["非有限の座標", clipboardText([valid]).replace('"x":0', '"x":1e400')],
    ["オブジェクトでないノード", clipboardText([valid, 1])],
  ])("%sはinvalid", (_, text) => {
    expect(decodeSubtreeClipboard(text)).toEqual({ ok: false, reason: "invalid" });
  });

  it("文字数が上限ちょうどなら受理し、1文字超えるとtoo-large", () => {
    const padding = MAX_SUBTREE_CLIPBOARD_LENGTH - clipboardText([{ ...valid, label: "" }]).length;
    const exact = clipboardText([{ ...valid, label: "a".repeat(padding) }]);

    expect(exact).toHaveLength(MAX_SUBTREE_CLIPBOARD_LENGTH);
    expect(decodeSubtreeClipboard(exact).ok).toBe(true);
    expect(decodeSubtreeClipboard(clipboardText([{ ...valid, label: "a".repeat(padding + 1) }]))).toEqual({ ok: false, reason: "too-large" });
  });

  it("文字数の上限を超える入力は、JSONとして不正でもtoo-large", () => {
    expect(decodeSubtreeClipboard("x".repeat(MAX_SUBTREE_CLIPBOARD_LENGTH + 1))).toEqual({ ok: false, reason: "too-large" });
  });

  it("ノード数が上限ちょうどなら受理し、1件超えるとtoo-large", () => {
    const chain = (count: number) => Array.from({ length: count }, (_, index) => (
      { ...valid, id: index + 1, parentId: index === 0 ? null : index }
    ));

    expect(decodeSubtreeClipboard(clipboardText(chain(MAX_SUBTREE_CLIPBOARD_NODES))).ok).toBe(true);
    expect(decodeSubtreeClipboard(clipboardText(chain(MAX_SUBTREE_CLIPBOARD_NODES + 1)))).toEqual({ ok: false, reason: "too-large" });
  });

  it("ノード数の上限を超える入力は、各ノードが不正でもtoo-large", () => {
    expect(decodeSubtreeClipboard(clipboardText(Array.from({ length: MAX_SUBTREE_CLIPBOARD_NODES + 1 }, () => 0))))
      .toEqual({ ok: false, reason: "too-large" });
  });

  it("上限内でも不正な入力はinvalid", () => {
    expect(decodeSubtreeClipboard(clipboardText(Array.from({ length: MAX_SUBTREE_CLIPBOARD_NODES }, () => valid))))
      .toEqual({ ok: false, reason: "invalid" });
  });
});

describe("validateSubtreeClipboardNodes", () => {
  it("単一ルート判定とグラフ検証を、ノード数に比例する読み取り回数で終える", () => {
    const nodeCount = MAX_SUBTREE_CLIPBOARD_NODES;
    // 逆順に並んだ深い鎖。根（id 1）は配列の末尾にある
    const chain = Array.from({ length: nodeCount }, (_, index) => {
      const id = nodeCount - index;
      return createTestNode({ id, parentId: id === 1 ? null : id - 1 });
    });
    let elementReads = 0;
    let idReads = 0;
    let parentIdReads = 0;
    const observedElements = chain.map((target) => new Proxy(target, {
      get(innerTarget, property, receiver) {
        if (property === "id") idReads += 1;
        if (property === "parentId") parentIdReads += 1;
        return Reflect.get(innerTarget, property, receiver);
      },
    }));
    const observedNodes = new Proxy(observedElements, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) elementReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });

    const result = validateSubtreeClipboardNodes(observedNodes);

    expect(result.ok && result.value.rootId).toBe(1);
    expect(result.ok && result.value.nodes).toHaveLength(nodeCount);
    expect(elementReads).toBeLessThanOrEqual(nodeCount * 8);
    expect(idReads).toBeLessThanOrEqual(nodeCount * 8);
    expect(parentIdReads).toBeLessThanOrEqual(nodeCount * 8);
  });

  it.each([
    ["空の配列", []],
    ["複数の根", [node(1, null), node(2, null)]],
    ["根が無い循環", [node(1, 2), node(2, 1)]],
    ["根と別の循環", [node(1, null), node(2, 3), node(3, 2)]],
  ])("%sはinvalid", (_, nodes) => {
    expect(validateSubtreeClipboardNodes(nodes)).toEqual({ ok: false, reason: "invalid" });
  });

  it("ノード数の上限を超える配列はtoo-large", () => {
    const nodes = Array.from({ length: MAX_SUBTREE_CLIPBOARD_NODES + 1 }, (_, index) => (
      createTestNode({ id: index + 1, parentId: index === 0 ? null : index })
    ));

    expect(validateSubtreeClipboardNodes(nodes)).toEqual({ ok: false, reason: "too-large" });
  });
});
