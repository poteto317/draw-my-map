import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";
import {
  buildPartFromSubtree,
  createEmptyPartsStore,
  MAX_PART_NAME,
  MAX_PART_NODES,
  MAX_PARTS,
  type Part,
  type PartsStore,
} from "@/domain/parts/partsModel";
import { decodePartsStore, encodePartsStore } from "@/domain/parts/partsCodec";

function node(
  id: number,
  parentId: number | null,
  overrides: Partial<Node> = {},
): Node {
  return createTestNode({
    id,
    parentId,
    x: id * 10,
    y: id * 20,
    label: `n${id}`,
    ...overrides,
  });
}

function samplePart(overrides: Partial<Part> = {}): Part {
  return {
    id: "part-1",
    name: "議事メモ",
    createdAt: "2026-11-22T00:00:00.000Z",
    nodes: [node(1, null, { label: "根" }), node(2, 1, { label: "子" })],
    ...overrides,
  };
}

describe("createEmptyPartsStore / MAX_PART_NODES", () => {
  it("MAX_PART_NODES は 10000、MAX_PARTS は 100、MAX_PART_NAME は 200", () => {
    expect(MAX_PART_NODES).toBe(10_000);
    expect(MAX_PARTS).toBe(100);
    expect(MAX_PART_NAME).toBe(200);
  });

  it("空ストアは毎回新しい参照を返す（共有デフォルト mutate 禁止）", () => {
    const a = createEmptyPartsStore();
    const b = createEmptyPartsStore();
    expect(a).toEqual({ version: 1, parts: [] });
    expect(a).not.toBe(b);
    expect(a.parts).not.toBe(b.parts);
    a.parts.push(samplePart());
    expect(createEmptyPartsStore().parts).toEqual([]);
  });
});

describe("buildPartFromSubtree", () => {
  const map: Node[] = [
    node(1, null),
    node(2, 1),
    node(3, 2),
    node(4, 1),
    node(5, null),
  ];

  it("選択根の部分木を根の parentId=null で Part にする", () => {
    const result = buildPartFromSubtree(map, 2, "枝A", "part-fixed", "2026-11-22T01:00:00.000Z");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.part.name).toBe("枝A");
    expect(result.part.id).toBe("part-fixed");
    expect(result.part.createdAt).toBe("2026-11-22T01:00:00.000Z");
    expect(result.part.nodes).toEqual([
      { ...map[1], parentId: null },
      map[2],
    ]);
    expect(map[1].parentId).toBe(1);
  });

  it("根が無いときは root-missing", () => {
    expect(buildPartFromSubtree(map, 99, "無し", "part-x", "2026-11-22T01:00:00.000Z")).toEqual({
      ok: false,
      reason: "root-missing",
    });
  });

  it("ノード数が MAX_PART_NODES を超えると too-large", () => {
    const root = node(1, null);
    const huge: Node[] = [root];
    for (let id = 2; id <= MAX_PART_NODES + 1; id += 1) {
      huge.push(node(id, 1));
    }
    expect(buildPartFromSubtree(huge, 1, "巨大", "part-huge", "2026-11-22T01:00:00.000Z")).toEqual({
      ok: false,
      reason: "too-large",
    });
    expect(
      buildPartFromSubtree(
        huge.slice(0, MAX_PART_NODES),
        1,
        "上限",
        "part-max",
        "2026-11-22T01:00:00.000Z",
      ).ok,
    ).toBe(true);
  });
});

describe("encodePartsStore / decodePartsStore", () => {
  it("往復できる", () => {
    const store: PartsStore = {
      version: 1,
      parts: [samplePart(), samplePart({ id: "part-2", name: "別" })],
    };
    const encoded = encodePartsStore(store);
    expect(decodePartsStore(encoded)).toEqual({
      status: "ok",
      store,
      repaired: false,
    });
  });

  it("null は空ストアを repaired: false で返す（毎回新規）", () => {
    const a = decodePartsStore(null);
    const b = decodePartsStore(null);
    expect(a).toEqual({
      status: "ok",
      store: { version: 1, parts: [] },
      repaired: false,
    });
    expect(b).toEqual(a);
    if (a.status !== "ok" || b.status !== "ok") return;
    expect(a.store).not.toBe(b.store);
    expect(a.store.parts).not.toBe(b.store.parts);
  });

  it("破損 JSON・版不正は corrupt（空成功にしない）", () => {
    expect(decodePartsStore("{")).toEqual({ status: "corrupt" });
    expect(decodePartsStore(JSON.stringify({ version: 2, parts: [] }))).toEqual({
      status: "corrupt",
    });
    expect(decodePartsStore(JSON.stringify({ version: 1 }))).toEqual({
      status: "corrupt",
    });
    expect(decodePartsStore(JSON.stringify([]))).toEqual({ status: "corrupt" });
  });

  it("部分破損エントリは除外し repaired: true", () => {
    const good = samplePart({ id: "keep" });
    const raw = JSON.stringify({
      version: 1,
      parts: [
        good,
        { id: "bad", name: "壊", createdAt: "2026-11-22T00:00:00.000Z", nodes: "nope" },
        {
          id: "bad-graph",
          name: "親無し",
          createdAt: "2026-11-22T00:00:00.000Z",
          nodes: [node(2, 1)],
        },
        samplePart({ id: "keep-2", name: "残る" }),
      ],
    });
    expect(decodePartsStore(raw)).toEqual({
      status: "ok",
      store: {
        version: 1,
        parts: [good, samplePart({ id: "keep-2", name: "残る" })],
      },
      repaired: true,
    });
  });

  it("parts 配列が MAX_PARTS を超えると corrupt", () => {
    const parts = Array.from({ length: MAX_PARTS + 1 }, (_, index) =>
      samplePart({ id: `part-${index}`, name: `p${index}` }),
    );
    expect(decodePartsStore(JSON.stringify({ version: 1, parts }))).toEqual({
      status: "corrupt",
    });
  });

  it("parts 配列がちょうど MAX_PARTS なら受け付ける", () => {
    const parts = Array.from({ length: MAX_PARTS }, (_, index) =>
      samplePart({ id: `part-${index}`, name: `p${index}` }),
    );
    expect(decodePartsStore(JSON.stringify({ version: 1, parts }))).toEqual({
      status: "ok",
      store: { version: 1, parts },
      repaired: false,
    });
  });

  it("name が MAX_PART_NAME を超えるエントリは除外し repaired: true", () => {
    const good = samplePart({ id: "keep" });
    const tooLong = samplePart({
      id: "long",
      name: "あ".repeat(MAX_PART_NAME + 1),
    });
    const raw = JSON.stringify({
      version: 1,
      parts: [good, tooLong, samplePart({ id: "keep-2", name: "残る" })],
    });
    expect(decodePartsStore(raw)).toEqual({
      status: "ok",
      store: {
        version: 1,
        parts: [good, samplePart({ id: "keep-2", name: "残る" })],
      },
      repaired: true,
    });
  });

  it("name がちょうど MAX_PART_NAME なら受け付ける", () => {
    const part = samplePart({ name: "あ".repeat(MAX_PART_NAME) });
    expect(decodePartsStore(encodePartsStore({ version: 1, parts: [part] }))).toEqual({
      status: "ok",
      store: { version: 1, parts: [part] },
      repaired: false,
    });
  });
});
