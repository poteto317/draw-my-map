import {
  MAX_NODE_SEARCH_RESULTS,
  createNodeSearchIndex,
  normalizeNodeSearchQuery,
  normalizeNodeSearchText,
  searchNodeLabels,
  type NodeSearchIndex,
  type NodeSearchIndexEntry,
} from "@/domain/search/nodeLabelSearch";
import { createTestNode } from "@/testing/createTestNode";

describe("nodeLabelSearch", () => {
  it("NFKCと小文字化でラベルを正規化し、検索語だけ前後をtrimする", () => {
    expect(normalizeNodeSearchText(" ＡＢＣ１　")).toBe(" abc1 ");
    expect(normalizeNodeSearchQuery(" ＡＢＣ１　")).toBe("abc1");
    expect(normalizeNodeSearchText("ｶﾞｲﾄﾞ")).toBe("ガイド");
  });

  it.each([
    ["先頭", "abc", "abcdef"],
    ["途中", "cde", "abcdef"],
    ["末尾", "def", "abcdef"],
    ["大文字小文字", "abc", "ABC"],
    ["全角英数", "abc1", "ＡＢＣ１"],
    ["半角カナ", "ｶﾞｲﾄﾞ", "ガイド"],
    ["途中の空白", "a b", "a b c"],
    ["改行", "行1\n行2", "前置き行1\n行2後置き"],
  ])("%sを部分一致で検索する", (_name, query, label) => {
    const index = createNodeSearchIndex([createTestNode({ label })]);

    expect(searchNodeLabels(index, query).total).toBe(1);
  });

  it("ひらがなとカタカナを同一視しない", () => {
    const index = createNodeSearchIndex([createTestNode({ label: "ガイド" })]);

    expect(searchNodeLabels(index, "がいど")).toEqual({ matches: [], total: 0 });
  });

  it("検索語の前後の半角・全角空白を無視し、空白だけなら結果を返さない", () => {
    const index = createNodeSearchIndex([createTestNode({ label: "ＡＢＣ１" })]);

    expect(searchNodeLabels(index, " abc1　")).toEqual({
      matches: [{ nodeId: 1, label: "ＡＢＣ１", parentLabel: null }],
      total: 1,
    });
    expect(searchNodeLabels(index, " 　")).toEqual({ matches: [], total: 0 });
  });

  it("検索語の途中の空白を文字として照合する", () => {
    const index = createNodeSearchIndex([
      createTestNode({ id: 1, label: "a b c" }),
      createTestNode({ id: 2, label: "ab" }),
    ]);

    expect(searchNodeLabels(index, "a b").matches.map(({ nodeId }) => nodeId)).toEqual([1]);
  });

  it("空ラベルの代替表示文言は検索対象にしない", () => {
    const index = createNodeSearchIndex([createTestNode({ label: "" })]);

    expect(searchNodeLabels(index, "新しい")).toEqual({ matches: [], total: 0 });
  });

  it("入力順と元ラベルを保ち、親の表示ラベルを事前計算する", () => {
    const child = createTestNode({ id: 2, parentId: 1, label: "Child" });
    const parent = createTestNode({ id: 1, label: "" });
    const orphan = createTestNode({ id: 3, parentId: 99, label: "orphan child" });
    const root = createTestNode({ id: 4, label: "root child" });
    const nodes = [child, parent, orphan, root];
    const before = nodes.map((node) => ({ ...node }));

    const result = searchNodeLabels(createNodeSearchIndex(nodes), "child");

    expect(result).toEqual({
      matches: [
        { nodeId: 2, label: "Child", parentLabel: "新しいノード" },
        { nodeId: 3, label: "orphan child", parentLabel: null },
        { nodeId: 4, label: "root child", parentLabel: null },
      ],
      total: 3,
    });
    expect(nodes).toEqual(before);
    expect(nodes[0]).toBe(child);
  });

  it("既定上限50件まで返し、総一致数は全件を数える", () => {
    const index = createNodeSearchIndex(
      Array.from({ length: 51 }, (_, index) => createTestNode({ id: index + 1, label: `match ${index}` }))
    );

    expect(searchNodeLabels(index, "match")).toMatchObject({
      matches: Array.from({ length: MAX_NODE_SEARCH_RESULTS }, (_, index) => ({ nodeId: index + 1 })),
      total: 51,
    });
    const exactLimit = searchNodeLabels(index.slice(0, 50), "match");
    expect(exactLimit.matches).toHaveLength(50);
    expect(exactLimit.total).toBe(50);
    expect(searchNodeLabels(index, "match", 3).matches.map(({ nodeId }) => nodeId)).toEqual([1, 2, 3]);
  });

  it.each([1_000, 10_000])("%i件の索引作成と検索が線形回数の読み取りで完了する", (size) => {
    const nodeReads = { element: 0, id: 0, parentId: 0, label: 0 };
    const rawNodes = Array.from({ length: size }, (_, offset) => {
      const id = size - offset;
      return createTestNode({ id, parentId: id === size ? null : id + 1, label: `node ${id}` });
    });
    const proxiedNodes = rawNodes.map((node) => new Proxy(node, {
      get(target, property, receiver) {
        if (property === "id" || property === "parentId" || property === "label") nodeReads[property] += 1;
        return Reflect.get(target, property, receiver);
      },
    }));
    const proxiedArray = new Proxy(proxiedNodes, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) nodeReads.element += 1;
        return Reflect.get(target, property, receiver);
      },
    });

    const index = createNodeSearchIndex(proxiedArray);
    const readsAfterIndex = { ...nodeReads };
    for (const count of Object.values(nodeReads)) expect(count).toBeLessThanOrEqual(10 * size);

    const searchReads = { element: 0, normalizedLabel: 0 };
    const proxiedEntries = index.map((entry) => new Proxy(entry, {
      get(target, property, receiver) {
        if (property === "normalizedLabel") searchReads.normalizedLabel += 1;
        return Reflect.get(target, property, receiver);
      },
    }));
    const proxiedIndex = new Proxy(proxiedEntries, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) searchReads.element += 1;
        return Reflect.get(target, property, receiver);
      },
    }) as NodeSearchIndex;

    expect(searchNodeLabels(proxiedIndex, "node").total).toBe(size);
    expect(searchReads.element).toBeLessThanOrEqual(10 * size);
    expect(searchReads.normalizedLabel).toBeLessThanOrEqual(10 * size);
    expect(nodeReads).toEqual(readsAfterIndex);

    searchReads.element = 0;
    searchReads.normalizedLabel = 0;
    expect(searchNodeLabels(proxiedIndex, "missing").total).toBe(0);
    expect(searchReads.element).toBeLessThanOrEqual(10 * size);
    expect(searchReads.normalizedLabel).toBeLessThanOrEqual(10 * size);
    expect(nodeReads).toEqual(readsAfterIndex);
  });

  it("索引エントリの公開された形を保つ", () => {
    const entry: NodeSearchIndexEntry = createNodeSearchIndex([createTestNode({ label: "A" })])[0];
    expect(entry).toEqual({ nodeId: 1, label: "A", parentLabel: null, normalizedLabel: "a" });
  });
});
