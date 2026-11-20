import {
  NODE_MAP_LINKS_MAX_COUNT,
  addNodeMapLink,
  areNodeMapLinksEqual,
  formatNodeMapLinkFailure,
  isValidTargetNodeId,
  nodeMapLinkKey,
  normalizeNodeMapLink,
  parsePositiveNodeIdString,
  remapNodeMapLinks,
  removeNodeMapLink,
  uniqueNodeMapLinks,
  withNodeMapLinks,
  type NodeMapLink,
  type NodeMapLinkFailureReason,
} from "@/domain/nodes/nodeMapLink";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

function mapLink(targetMapId: string, targetNodeId?: number): NodeMapLink {
  return targetNodeId === undefined ? { targetMapId } : { targetMapId, targetNodeId };
}

function mapLinksOf(count: number): NodeMapLink[] {
  return Array.from({ length: count }, (_, index) => mapLink(`map-${index}`));
}

describe("定数", () => {
  it("件数の上限は 10", () => {
    expect(NODE_MAP_LINKS_MAX_COUNT).toBe(10);
  });
});

describe("isValidTargetNodeId", () => {
  it.each<[string, unknown, boolean]>([
    ["1", 1, true],
    ["大きな安全整数", Number.MAX_SAFE_INTEGER, true],
    ["0", 0, false],
    ["負の整数", -1, false],
    ["小数", 1.5, false],
    ["NaN", Number.NaN, false],
    ["Infinity", Number.POSITIVE_INFINITY, false],
    ["安全整数上限超え", Number.MAX_SAFE_INTEGER + 1, false],
    ["数値文字列", "1", false],
    ["undefined", undefined, false],
    ["null", null, false],
  ])("%s は %s", (_name, value, expected) => {
    expect(isValidTargetNodeId(value)).toBe(expected);
  });
});

describe("parsePositiveNodeIdString", () => {
  it.each<[string, string, number | null]>([
    ["1", "1", 1],
    ["複数桁の正の整数", "42", 42],
    ["MAX_SAFE_INTEGER", String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
    ["0 は拒否", "0", null],
    ["負数は拒否", "-1", null],
    ["小数は拒否", "1.5", null],
    ["数値の後ろに文字は拒否", "1a", null],
    ["空文字は拒否", "", null],
    ["前後空白は拒否", " 1 ", null],
    ["先頭ゼロは拒否", "01", null],
    ["+ 符号付きは拒否", "+1", null],
    ["安全整数上限超え（9007199254740992）は拒否", "9007199254740992", null],
  ])("%s", (_name, raw, expected) => {
    expect(parsePositiveNodeIdString(raw)).toBe(expected);
  });
});

describe("normalizeNodeMapLink", () => {
  it("有効なマップ全体リンクを正規化し、targetNodeId キーを省略する", () => {
    const result = normalizeNodeMapLink({ targetMapId: "map_1-A" });

    expect(result).toEqual({ ok: true, link: { targetMapId: "map_1-A" } });
    if (result.ok) {
      expect("targetNodeId" in result.link).toBe(false);
    }
  });

  it("targetNodeId が undefined 明示でもキーごと省略する", () => {
    const result = normalizeNodeMapLink({ targetMapId: "map-1", targetNodeId: undefined });

    expect(result).toEqual({ ok: true, link: { targetMapId: "map-1" } });
    if (result.ok) {
      expect("targetNodeId" in result.link).toBe(false);
    }
  });

  it("有効なノード指定リンクを正規化する", () => {
    expect(normalizeNodeMapLink({ targetMapId: "map-1", targetNodeId: 5 })).toEqual({
      ok: true,
      link: { targetMapId: "map-1", targetNodeId: 5 },
    });
  });

  it.each<[string, { targetMapId: unknown; targetNodeId?: unknown }, "invalid-map-id" | "invalid-node-id"]>([
    ["空文字のマップ ID", { targetMapId: "" }, "invalid-map-id"],
    ["空白を含むマップ ID", { targetMapId: "map 1" }, "invalid-map-id"],
    ["コロンを含むマップ ID", { targetMapId: "map:1" }, "invalid-map-id"],
    ["65 文字のマップ ID", { targetMapId: "a".repeat(65) }, "invalid-map-id"],
    ["文字列以外のマップ ID", { targetMapId: 123 }, "invalid-map-id"],
    ["マップ ID 不正かつノード ID 不正は invalid-map-id が先", { targetMapId: "", targetNodeId: 0 }, "invalid-map-id"],
    ["ノード ID が 0", { targetMapId: "map-1", targetNodeId: 0 }, "invalid-node-id"],
    ["ノード ID が負数", { targetMapId: "map-1", targetNodeId: -3 }, "invalid-node-id"],
    ["ノード ID が小数", { targetMapId: "map-1", targetNodeId: 1.5 }, "invalid-node-id"],
    ["ノード ID が安全整数上限超え", { targetMapId: "map-1", targetNodeId: 9007199254740992 }, "invalid-node-id"],
    ["ノード ID が文字列", { targetMapId: "map-1", targetNodeId: "1" }, "invalid-node-id"],
    ["ノード ID が null", { targetMapId: "map-1", targetNodeId: null }, "invalid-node-id"],
  ])("%s は %s で拒否する", (_name, input, reason) => {
    expect(normalizeNodeMapLink(input)).toEqual({ ok: false, reason });
  });
});

describe("nodeMapLinkKey", () => {
  it("マップ全体リンクと特定ノードリンクで衝突不能な複合キーを作る", () => {
    expect(nodeMapLinkKey(mapLink("map-1"))).toBe("map-1:map");
    expect(nodeMapLinkKey(mapLink("map-1", 42))).toBe("map-1:node:42");
    expect(nodeMapLinkKey(mapLink("map-1"))).not.toBe(nodeMapLinkKey(mapLink("map-1", 1)));
    expect(nodeMapLinkKey(mapLink("map-1", 1))).not.toBe(nodeMapLinkKey(mapLink("map-1", 2)));
  });
});

describe("uniqueNodeMapLinks", () => {
  it("同じ鍵のリンクは最初を残して後を捨て、順を保つ", () => {
    const input = [
      mapLink("map-1"),
      mapLink("map-1", 2),
      mapLink("map-1"),
      mapLink("map-2", 3),
      mapLink("map-1", 2),
    ];

    expect(uniqueNodeMapLinks(input)).toEqual([
      mapLink("map-1"),
      mapLink("map-1", 2),
      mapLink("map-2", 3),
    ]);
  });

  it("空配列は空配列を返し、元の配列は変えない", () => {
    const original = [mapLink("map-1"), mapLink("map-1")];
    expect(uniqueNodeMapLinks([])).toEqual([]);
    uniqueNodeMapLinks(original);
    expect(original).toEqual([mapLink("map-1"), mapLink("map-1")]);
  });
});

describe("areNodeMapLinksEqual", () => {
  it("別参照でも内容と順が同じなら真、undefined と空配列は同値", () => {
    expect(areNodeMapLinksEqual([mapLink("m1"), mapLink("m2", 3)], [mapLink("m1"), mapLink("m2", 3)])).toBe(true);
    expect(areNodeMapLinksEqual(undefined, undefined)).toBe(true);
    expect(areNodeMapLinksEqual(undefined, [])).toBe(true);
    expect(areNodeMapLinksEqual([], undefined)).toBe(true);
  });

  it.each<[string, readonly NodeMapLink[] | undefined, readonly NodeMapLink[] | undefined]>([
    ["順が違う", [mapLink("m1"), mapLink("m2")], [mapLink("m2"), mapLink("m1")]],
    ["長さが違う", [mapLink("m1")], [mapLink("m1"), mapLink("m2")]],
    ["targetMapId が違う", [mapLink("m1")], [mapLink("m2")]],
    ["targetNodeId の有無が違う", [mapLink("m1")], [mapLink("m1", 1)]],
    ["targetNodeId が違う", [mapLink("m1", 1)], [mapLink("m1", 2)]],
    ["片方だけ持つ", undefined, [mapLink("m1")]],
  ])("%s なら偽", (_name, a, b) => {
    expect(areNodeMapLinksEqual(a, b)).toBe(false);
  });
});

describe("withNodeMapLinks", () => {
  const node = createTestNode({ id: 1, label: "対象", mapLinks: [mapLink("map-1")] });

  it("空でない並びなら mapLinks にする（元のノードは変えない）", () => {
    const next = withNodeMapLinks(node, [mapLink("map-1"), mapLink("map-2", 3)]);

    expect(next).toEqual({ ...node, mapLinks: [mapLink("map-1"), mapLink("map-2", 3)] });
    expect(node.mapLinks).toEqual([mapLink("map-1")]);
  });

  it.each([undefined, []])("%p なら mapLinks のキーごと外す", (links) => {
    const next = withNodeMapLinks(node, links);

    expect("mapLinks" in next).toBe(false);
    expect(next).toEqual({
      id: 1,
      parentId: null,
      x: 0,
      y: 0,
      width: 100,
      height: 60,
      label: "対象",
      importance: "medium",
    });
  });
});

describe("addNodeMapLink", () => {
  const CURRENT_MAP_ID = "current-map";
  const nodes: readonly Node[] = Object.freeze([
    Object.freeze(createTestNode({ id: 1, label: "リンクあり", mapLinks: [mapLink("other-map", 10)] })),
    Object.freeze(createTestNode({ id: 2, label: "リンクなし", x: 200 })),
    Object.freeze(createTestNode({ id: 3, label: "上限", x: 400, mapLinks: mapLinksOf(NODE_MAP_LINKS_MAX_COUNT) })),
  ]);

  it("リンクを末尾に追加し、ほかのノードは同じ参照のまま", () => {
    const result = addNodeMapLink(nodes, 1, CURRENT_MAP_ID, { targetMapId: "map-2", targetNodeId: 5 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodes[0].mapLinks).toEqual([mapLink("other-map", 10), mapLink("map-2", 5)]);
    expect(result.nodes[1]).toBe(nodes[1]);
    expect(result.nodes[2]).toBe(nodes[2]);
  });

  it("同一マップの他ノードへのリンクは許可する", () => {
    const result = addNodeMapLink(nodes, 2, CURRENT_MAP_ID, { targetMapId: CURRENT_MAP_ID, targetNodeId: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodes[1].mapLinks).toEqual([mapLink(CURRENT_MAP_ID, 1)]);
  });

  it("現在マップ全体へのリンク（targetNodeId 省略）は許可する", () => {
    const result = addNodeMapLink(nodes, 2, CURRENT_MAP_ID, { targetMapId: CURRENT_MAP_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodes[1].mapLinks).toEqual([mapLink(CURRENT_MAP_ID)]);
    expect("targetNodeId" in result.nodes[1].mapLinks![0]).toBe(false);
  });

  it("他マップの同じノード番号へのリンクは自己ノードではなく許可する", () => {
    const result = addNodeMapLink(nodes, 2, CURRENT_MAP_ID, { targetMapId: "other-map", targetNodeId: 2 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodes[1].mapLinks).toEqual([mapLink("other-map", 2)]);
  });

  it("9 件のノードには 10 件目を足せる", () => {
    const nine = [createTestNode({ id: 1, mapLinks: mapLinksOf(9) })];
    const result = addNodeMapLink(nine, 1, CURRENT_MAP_ID, { targetMapId: "map-9" });

    expect(result.ok && result.nodes[0].mapLinks).toHaveLength(NODE_MAP_LINKS_MAX_COUNT);
  });

  it.each<[string, number, { targetMapId: string; targetNodeId?: number }, NodeMapLinkFailureReason]>([
    ["対象ノード不在（不正入力より先に node-missing）", 99, { targetMapId: "" }, "node-missing"],
    ["マップ ID 不正", 2, { targetMapId: "bad id" }, "invalid-map-id"],
    ["ノード ID 不正（0）", 2, { targetMapId: "other-map", targetNodeId: 0 }, "invalid-node-id"],
    ["自己ノードへのリンク", 2, { targetMapId: CURRENT_MAP_ID, targetNodeId: 2 }, "self-node"],
    ["重複リンク", 1, { targetMapId: "other-map", targetNodeId: 10 }, "duplicate"],
    ["上限 10 件に達している", 3, { targetMapId: "map-new" }, "too-many"],
    ["上限に達していても自己ノードなら self-node が先", 3, { targetMapId: CURRENT_MAP_ID, targetNodeId: 3 }, "self-node"],
    ["上限に達していても重複なら duplicate が先", 3, { targetMapId: "map-0" }, "duplicate"],
    ["上限に達していても不正入力なら正規化エラーが先", 3, { targetMapId: "" }, "invalid-map-id"],
  ])("%s ときは %s を返す", (_name, nodeId, input, reason) => {
    expect(addNodeMapLink(nodes, nodeId, CURRENT_MAP_ID, input)).toEqual({ ok: false, reason });
  });
});

describe("removeNodeMapLink", () => {
  const nodes: readonly Node[] = Object.freeze([
    Object.freeze(
      createTestNode({
        id: 1,
        label: "2件",
        mapLinks: [mapLink("map-1"), mapLink("map-1", 2)],
      }),
    ),
    Object.freeze(createTestNode({ id: 2, label: "1件", x: 200, mapLinks: [mapLink("map-2", 5)] })),
    Object.freeze(createTestNode({ id: 3, label: "0件", x: 400 })),
  ]);

  it("値一致するリンクだけを消し、順を保ち、ほかのノードは同じ参照のまま（L-035）", () => {
    const next = removeNodeMapLink(nodes, 1, mapLink("map-1"));

    expect(next?.[0].mapLinks).toEqual([mapLink("map-1", 2)]);
    expect(next?.[1]).toBe(nodes[1]);
    expect(nodes[0].mapLinks).toEqual([mapLink("map-1"), mapLink("map-1", 2)]);
  });

  it("最後の 1 件を消すと mapLinks キーごと外す（空配列を残さない）", () => {
    const next = removeNodeMapLink(nodes, 2, mapLink("map-2", 5));

    expect(next).not.toBeNull();
    expect("mapLinks" in next![1]).toBe(false);
  });

  it.each<[string, number, NodeMapLink]>([
    ["対象ノードが無い", 99, mapLink("map-1")],
    ["mapLinks の無いノード", 3, mapLink("map-1")],
    ["一致するリンクが無い（mapId 違い）", 1, mapLink("map-999")],
    ["一致するリンクが無い（nodeId 違い）", 1, mapLink("map-1", 999)],
  ])("%s ときは null（何も変えない）", (_name, nodeId, target) => {
    expect(removeNodeMapLink(nodes, nodeId, target)).toBeNull();
  });
});

describe("remapNodeMapLinks", () => {
  it("マッピングにある targetMapId を新 ID へ付け替え、対象外はそのまま残す", () => {
    const nodes = [
      createTestNode({
        id: 1,
        label: "変換対象",
        mapLinks: [mapLink("old-a"), mapLink("old-b", 4), mapLink("external-map", 9)],
      }),
      createTestNode({ id: 2, label: "リンクなし" }),
      createTestNode({ id: 3, label: "対象外のみ", mapLinks: [mapLink("external-map")] }),
    ];
    const mapping = new Map([
      ["old-a", "new-a"],
      ["old-b", "new-b"],
    ]);

    const next = remapNodeMapLinks(nodes, mapping);

    expect(next[0].mapLinks).toEqual([
      mapLink("new-a"),
      mapLink("new-b", 4),
      mapLink("external-map", 9),
    ]);
    expect("targetNodeId" in next[0].mapLinks![0]).toBe(false);
    expect(next[1]).toBe(nodes[1]);
    expect(next[2]).toBe(nodes[2]);
  });

  it("リマップの結果で重複が生じた場合は先勝ちで一意化する", () => {
    const nodes = [
      createTestNode({
        id: 1,
        label: "重複発生",
        mapLinks: [mapLink("old-a", 1), mapLink("new-a", 1)],
      }),
    ];
    const mapping = new Map([["old-a", "new-a"]]);

    const next = remapNodeMapLinks(nodes, mapping);

    expect(next[0].mapLinks).toEqual([mapLink("new-a", 1)]);
  });
});

describe("formatNodeMapLinkFailure", () => {
  it.each<[NodeMapLinkFailureReason, string]>([
    ["invalid-map-id", "リンク先のマップが正しくありません。"],
    ["invalid-node-id", "リンク先のノードが正しくありません。"],
    ["self-node", "自分自身のノードにはリンクできません。"],
    ["duplicate", "同じマップ間リンクがすでに追加されています。"],
    ["too-many", "マップ間リンクは 1 つのノードに 10 件まで追加できます。"],
    ["node-missing", "ノードが見つかりません。"],
  ])("%s は「%s」", (reason, message) => {
    expect(formatNodeMapLinkFailure(reason)).toBe(message);
  });
});
