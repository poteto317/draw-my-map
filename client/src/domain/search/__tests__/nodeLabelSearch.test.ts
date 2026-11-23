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
      matches: [{ nodeId: 1, label: "ＡＢＣ１", parentLabel: null, matchedBy: "label" }],
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

  it("検索結果に icon / kind を含めない（プレーン）", () => {
    const index = createNodeSearchIndex([
      createTestNode({
        id: 1,
        label: "見た目付き",
        icon: "🎯",
        kind: "idea",
      }),
    ]);

    const result = searchNodeLabels(index, "見た目");
    expect(result.matches).toEqual([
      { nodeId: 1, label: "見た目付き", parentLabel: null, matchedBy: "label" },
    ]);
    expect(result.matches[0]).not.toHaveProperty("icon");
    expect(result.matches[0]).not.toHaveProperty("kind");
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
        { nodeId: 2, label: "Child", parentLabel: "新しいノード", matchedBy: "label" },
        { nodeId: 3, label: "orphan child", parentLabel: null, matchedBy: "label" },
        { nodeId: 4, label: "root child", parentLabel: null, matchedBy: "label" },
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
    expect(entry).toEqual({ nodeId: 1, label: "A", parentLabel: null, normalizedLabel: "a", normalizedLinks: [] });
  });
});

describe("URL の検索", () => {
  // パス「パス」とクエリ「日本語」をパーセントエンコードした URL（保存される形）
  const JAPANESE = "https://example.com/%E3%83%91%E3%82%B9?q=%E6%97%A5%E6%9C%AC%E8%AA%9E";

  it("ラベルに無くても URL に含まれれば、matchedBy: link で返す", () => {
    const index = createNodeSearchIndex([createTestNode({ id: 1, label: "資料", links: ["https://example.com/report"] })]);

    expect(searchNodeLabels(index, "report")).toEqual({
      matches: [{ nodeId: 1, label: "資料", parentLabel: null, matchedBy: "link" }],
      total: 1,
    });
  });

  it("ラベルと URL の両方に一致すれば、ラベル一致として扱う", () => {
    const index = createNodeSearchIndex([createTestNode({ id: 1, label: "example", links: ["https://example.com/"] })]);

    expect(searchNodeLabels(index, "example").matches[0].matchedBy).toBe("label");
  });

  it("URL もラベルと同じ正規化（NFKC と小文字化）で照合する", () => {
    const index = createNodeSearchIndex([createTestNode({ id: 1, label: "資料", links: ["https://example.com/Report"] })]);

    expect(searchNodeLabels(index, "ＲＥＰＯＲＴ").total).toBe(1);
  });

  it.each(["パス", "日本語", "%E3%83%91"])("パーセントエンコードを戻した形でも、エンコードのままでも一致する（%s）", (query) => {
    const index = createNodeSearchIndex([createTestNode({ id: 1, label: "資料", links: [JAPANESE] })]);

    expect(searchNodeLabels(index, query).matches).toEqual([{ nodeId: 1, label: "資料", parentLabel: null, matchedBy: "link" }]);
  });

  it("不正なパーセントエンコードの URL は、例外にせず、エンコードのままで一致する", () => {
    const index = createNodeSearchIndex([createTestNode({ id: 1, label: "資料", links: ["https://example.com/%E3%81"] })]);

    expect(searchNodeLabels(index, "%e3%81").total).toBe(1);
  });

  it("URL の区切りをまたいで一致しない", () => {
    const index = createNodeSearchIndex([
      createTestNode({ id: 1, label: "資料", links: ["https://a.example/x", "https://b.example/y"] }),
    ]);

    expect(searchNodeLabels(index, "xhttps")).toEqual({ matches: [], total: 0 });
    expect(searchNodeLabels(index, "x https")).toEqual({ matches: [], total: 0 });
  });

  it("件数（total）にはラベル一致と URL 一致の両方を数え、並びは配列順", () => {
    const index = createNodeSearchIndex([
      createTestNode({ id: 1, label: "対象外" }),
      createTestNode({ id: 2, label: "URLだけ", links: ["https://example.com/target"] }),
      createTestNode({ id: 3, label: "target のラベル" }),
    ]);

    expect(searchNodeLabels(index, "target")).toEqual({
      matches: [
        { nodeId: 2, label: "URLだけ", parentLabel: null, matchedBy: "link" },
        { nodeId: 3, label: "target のラベル", parentLabel: null, matchedBy: "label" },
      ],
      total: 2,
    });
  });

  it("索引の normalizedLinks は、URL ごとにエンコードのままと戻した形を並べ、同じ文字列は 1 つにする", () => {
    const [withLinks, withoutLinks] = createNodeSearchIndex([
      createTestNode({ id: 1, links: ["https://example.com/Report", JAPANESE] }),
      createTestNode({ id: 2 }),
    ]);

    expect(withLinks.normalizedLinks).toEqual([
      "https://example.com/report",
      "https://example.com/%e3%83%91%e3%82%b9?q=%e6%97%a5%e6%9c%ac%e8%aa%9e",
      "https://example.com/パス?q=日本語",
    ]);
    expect(withoutLinks.normalizedLinks).toEqual([]);
  });

  it("links の配列が同じなら、索引を作り直しても decodeURI を繰り返さない", () => {
    const decodeSpy = jest.spyOn(globalThis, "decodeURI");
    const links = ["https://example.com/cache-test"];

    createNodeSearchIndex([createTestNode({ id: 1, label: "a", links })]);
    createNodeSearchIndex([createTestNode({ id: 1, label: "移動後", x: 500, links })]);
    expect(decodeSpy).toHaveBeenCalledTimes(1);

    // 内容が同じでも別の配列なら、作り直す
    createNodeSearchIndex([createTestNode({ id: 1, label: "a", links: [...links] })]);
    expect(decodeSpy).toHaveBeenCalledTimes(2);
    decodeSpy.mockRestore();
  });
});
