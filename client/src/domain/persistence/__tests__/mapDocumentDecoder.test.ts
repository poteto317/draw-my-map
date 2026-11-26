import { parseMapDocumentJson, parseMapDocumentJsonWithVersion } from "@/domain/persistence/mapDocumentDecoder";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";
import { createJpegDataUrl } from "@/testing/jpegFixture";

function node(id: number, parentId: number | null, label = `node-${id}`): Node {
  return createTestNode({
    id,
    parentId,
    x: id * 10,
    y: -id * 5,
    width: 160,
    height: 64,
    label,
  });
}

describe("MapDocument Decoder", () => {
  it("V1ノードへmediumを補完してV2として返す", () => {
    const legacy = JSON.stringify({
      version: 1,
      layoutMode: "manual",
      nodes: [{
        id: 1,
        parentId: null,
        x: 0,
        y: 0,
        width: 160,
        height: 64,
        label: "旧形式",
      }],
    });

    expect(parseMapDocumentJson(legacy)).toEqual({
      ok: true,
      value: {
        version: 3,
        layoutMode: "manual",
        nodes: [expect.objectContaining({ id: 1, importance: "medium" })],
      },
    });
  });

  it("V1では未知のimportanceフィールドを無視する", () => {
    const legacy = JSON.stringify({
      version: 1,
      layoutMode: "manual",
      nodes: [{ ...node(1, null), importance: "urgent" }],
    });

    expect(parseMapDocumentJson(legacy)).toEqual({
      ok: true,
      value: {
        version: 3,
        layoutMode: "manual",
        nodes: [node(1, null)],
      },
    });
  });

  it.each([undefined, "urgent", 1])(
    "V2の不正重要度%pを拒否する",
    (importance) => {
      const json = JSON.stringify({
        version: 2,
        layoutMode: "manual",
        nodes: [{ ...node(1, null), importance }],
      });

      expect(parseMapDocumentJson(json)).toEqual({
        ok: false,
        error: "node[0].importanceはhigh、medium、lowのいずれかである必要があります。",
      });
    },
  );

  it("JSONとして解析できない文字列を拒否する", () => {
    expect(parseMapDocumentJson("{"))
      .toEqual({ ok: false, error: "JSONを解析できませんでした。" });
  });

  it.each(["null", "[]", '"map"', "42"])(
    "オブジェクトではないルート%sを拒否する",
    (json) => {
      expect(parseMapDocumentJson(json)).toEqual({
        ok: false,
        error: "マップデータの形式が不正です。",
      });
    },
  );

  it.each([
    ['{"version":4,"layoutMode":"manual","nodes":[]}', "未対応のマップ形式です。"],
    ['{"version":1,"layoutMode":"grid","nodes":[]}', "レイアウトモードが不正です。"],
    ['{"version":1,"layoutMode":"manual","nodes":{}}', "ノード一覧が不正です。"],
  ])("ドキュメント形式の不正を拒否する", (json, error) => {
    expect(parseMapDocumentJson(json)).toEqual({ ok: false, error });
  });

  it("不正なノードを位置付きの正規化エラーとして拒否する", () => {
    const json = JSON.stringify({
      version: 1,
      layoutMode: "manual",
      nodes: [node(1, null), { ...node(2, 1), width: 0 }],
    });

    expect(parseMapDocumentJson(json)).toEqual({
      ok: false,
      error: "node[1].widthは0より大きい有限の数値である必要があります。",
    });
  });

  it("不正なグラフをグラフ検証エラーとして拒否する", () => {
    const json = JSON.stringify({
      version: 1,
      layoutMode: "manual",
      nodes: [node(1, 99)],
    });

    expect(parseMapDocumentJson(json)).toEqual({
      ok: false,
      error: "親ノード 99 が存在しません。",
    });
  });

  it("解析元を変更せず既知フィールドだけの新しいノードを返す", () => {
    const source = {
      version: 1,
      layoutMode: "manual",
      nodes: [{ ...node(1, null), ignored: "維持" }],
    };
    const sourceBefore = {
      ...source,
      nodes: source.nodes.map((current) => ({ ...current })),
    };
    const parseSpy = jest.spyOn(JSON, "parse").mockReturnValue(source);

    try {
      const result = parseMapDocumentJson("source");

      expect(result).toEqual({
        ok: true,
        value: {
          version: 3,
          layoutMode: "manual",
          nodes: [node(1, null)],
        },
      });
      if (result.ok) expect(result.value.nodes[0]).not.toBe(source.nodes[0]);
      expect(source).toEqual(sourceBefore);
    } finally {
      parseSpy.mockRestore();
    }
  });
});

const baseNode = { id: 1, parentId: null, x: 0, y: 0, width: 100, height: 116, label: "a", importance: "medium" };
const IMAGE = createJpegDataUrl(128, 128);
const json = (version: number, node: Record<string, unknown>) =>
  JSON.stringify({ version, layoutMode: "manual", nodes: [node] });

describe("version 3 のイラスト", () => {
  it("version 3 の illustration を読み込む", () => {
    const parsed = parseMapDocumentJsonWithVersion(json(3, { ...baseNode, illustration: IMAGE }));
    expect(parsed).toMatchObject({ ok: true, value: { sourceVersion: 3, document: { version: 3 } } });
    expect(parsed.ok && parsed.value.document.nodes[0].illustration).toBe(IMAGE);
  });

  it("イラストがあり高さが不足するノードは、高さを ILLUSTRATED_NODE_HEIGHT に正規化する", () => {
    const parsed = parseMapDocumentJsonWithVersion(json(3, { ...baseNode, height: 60, illustration: IMAGE }));
    expect(parsed.ok && parsed.value.document.nodes[0].height).toBe(116);
  });

  it("イラストがあり高さが十分なノードは、高さを変えない", () => {
    const parsed = parseMapDocumentJsonWithVersion(json(3, { ...baseNode, height: 200, illustration: IMAGE }));
    expect(parsed.ok && parsed.value.document.nodes[0].height).toBe(200);
  });

  it("イラストが無いノードの高さは、変えない", () => {
    const parsed = parseMapDocumentJsonWithVersion(json(3, { ...baseNode, height: 60 }));
    expect(parsed.ok && parsed.value.document.nodes[0].height).toBe(60);
  });

  it("illustration が無いノードは、項目を持たない", () => {
    const parsed = parseMapDocumentJsonWithVersion(json(3, baseNode));
    expect(parsed.ok && "illustration" in parsed.value.document.nodes[0]).toBe(false);
  });

  it.each([1, 2])("version %i の illustration は無視する", (version) => {
    const node = version === 1 ? { ...baseNode, illustration: IMAGE, importance: undefined } : { ...baseNode, illustration: IMAGE };
    const parsed = parseMapDocumentJsonWithVersion(json(version, node));
    expect(parsed.ok && "illustration" in parsed.value.document.nodes[0]).toBe(false);
    expect(parsed.ok && parsed.value.document.version).toBe(3);
  });

  it.each([
    123,
    "https://example.com/a.png",
    "data:image/svg+xml;base64,AAAA",
    "data:image/png;base64,AAAA",
    createJpegDataUrl(20000, 20000),
  ])(
    "version 3 で不正な illustration（%p）は、読み込みを失敗にする",
    (illustration) => {
      expect(parseMapDocumentJsonWithVersion(json(3, { ...baseNode, illustration }))).toEqual({
        ok: false,
        error: "node[0].illustrationは、画像のdata URLである必要があります。",
      });
    },
  );

  it("version 4 は未対応", () => {
    expect(parseMapDocumentJsonWithVersion(json(4, baseNode))).toEqual({ ok: false, error: "未対応のマップ形式です。" });
  });
});

describe("version 3 の詳細メモ", () => {
  it("version 3 の note を読み込む", () => {
    const parsed = parseMapDocumentJsonWithVersion(json(3, { ...baseNode, note: "メモ" }));

    expect(parsed.ok && parsed.value.document.nodes[0].note).toBe("メモ");
  });

  it.each([1, 2])("version %i の note は無視する", (version) => {
    const node = version === 1 ? { ...baseNode, note: "メモ", importance: undefined } : { ...baseNode, note: "メモ" };
    const parsed = parseMapDocumentJsonWithVersion(json(version, node));

    expect(parsed.ok && "note" in parsed.value.document.nodes[0]).toBe(false);
  });

  it("version 3 で上限超過の note は、読み込みを失敗にする", () => {
    expect(parseMapDocumentJsonWithVersion(json(3, { ...baseNode, note: "a".repeat(10001) }))).toEqual({
      ok: false,
      error: "node[0].noteは10000文字以内の文字列である必要があります。",
    });
  });
});

describe("version 3 の URL", () => {
  it("version 3 の links を正規化して読み込み、重複は後のものを捨てる", () => {
    const parsed = parseMapDocumentJsonWithVersion(json(3, {
      ...baseNode,
      links: ["https://Example.com", "https://example.com/"],
    }));

    expect(parsed.ok && parsed.value.document.nodes[0].links).toEqual(["https://example.com/"]);
  });

  it.each([1, 2])("version %i の links は無視する", (version) => {
    const links = ["javascript:alert(1)"];
    const node = version === 1 ? { ...baseNode, links, importance: undefined } : { ...baseNode, links };
    const parsed = parseMapDocumentJsonWithVersion(json(version, node));

    expect(parsed.ok && "links" in parsed.value.document.nodes[0]).toBe(false);
  });

  it("version 3 で http/https 以外の links は、読み込みを失敗にする", () => {
    expect(parseMapDocumentJsonWithVersion(json(3, { ...baseNode, links: ["javascript:alert(1)"] }))).toEqual({
      ok: false,
      error: "node[0].linksは、http または https の URL（2048文字以内）の配列（最大10件）である必要があります。",
    });
  });
});

describe("version 3 のタグ", () => {
  it("version 3 の tags を正規化して読み込み、同じタグとみなす要素は後のものを捨てる", () => {
    const parsed = parseMapDocumentJsonWithVersion(json(3, {
      ...baseNode,
      tags: ["  Python ", "PYTHON", "重要"],
    }));

    expect(parsed.ok && parsed.value.document.nodes[0].tags).toEqual(["Python", "重要"]);
  });

  it.each([1, 2])("version %i の tags は無視する", (version) => {
    const tags = ["a\u0000b"];
    const node = version === 1 ? { ...baseNode, tags, importance: undefined } : { ...baseNode, tags };
    const parsed = parseMapDocumentJsonWithVersion(json(version, node));

    expect(parsed.ok && "tags" in parsed.value.document.nodes[0]).toBe(false);
  });

  it("version 3 で制御文字を含む tags は、読み込みを失敗にする", () => {
    expect(parseMapDocumentJsonWithVersion(json(3, { ...baseNode, tags: ["a\u0000b"] }))).toEqual({
      ok: false,
      error: "node[0].tagsは、30文字以内のタグ名の配列（最大10件）である必要があります。",
    });
  });
});

describe("version 3 の出典", () => {
  it("version 3 の sources を正規化して読み込み、同じ出典とみなす要素は後のものを捨てる", () => {
    const parsed = parseMapDocumentJsonWithVersion(json(3, {
      ...baseNode,
      sources: [
        { title: "  Python ", page: "1", url: "https://Example.com" },
        { title: "PYTHON", page: "1", url: "https://example.com/" },
        { title: "設計" },
      ],
    }));

    expect(parsed.ok && parsed.value.document.nodes[0].sources).toEqual([
      { title: "Python", page: "1", url: "https://example.com/" },
      { title: "設計" },
    ]);
  });

  it.each([1, 2])("version %i の sources は無視する", (version) => {
    const sources = [{ title: "a\u0000b" }];
    const node = version === 1 ? { ...baseNode, sources, importance: undefined } : { ...baseNode, sources };
    const parsed = parseMapDocumentJsonWithVersion(json(version, node));

    expect(parsed.ok && "sources" in parsed.value.document.nodes[0]).toBe(false);
  });

  it("version 3 で未知キーを含む sources は、読み込みを失敗にする", () => {
    expect(
      parseMapDocumentJsonWithVersion(json(3, { ...baseNode, sources: [{ title: "設計", author: "x" }] })),
    ).toEqual({
      ok: false,
      error:
        "node[0].sourcesは、タイトル（200文字以内）・ページ（80文字以内）・http/https の URL からなる出典の配列（最大10件）である必要があります。",
    });
  });
});

describe("version 3 の treeDirection と layoutSpacing", () => {
  const baseDoc = { version: 3, layoutMode: "manual", nodes: [node(1, null)] };

  it("欠落は既定として読み込む", () => {
    const result = parseMapDocumentJson(JSON.stringify(baseDoc));
    expect(result).toEqual({
      ok: true,
      value: { version: 3, layoutMode: "manual", nodes: [node(1, null)] },
    });
    expect(result.ok && "treeDirection" in result.value).toBe(false);
    expect(result.ok && "layoutSpacing" in result.value).toBe(false);
  });

  it("tbとlayoutSpacingを読み込む", () => {
    const jsonValue = JSON.stringify({
      ...baseDoc,
      treeDirection: "tb",
      layoutSpacing: { childGap: 100, siblingGap: 24 },
    });
    expect(parseMapDocumentJson(jsonValue)).toEqual({
      ok: true,
      value: {
        version: 3,
        layoutMode: "manual",
        treeDirection: "tb",
        layoutSpacing: { childGap: 100, siblingGap: 24 },
        nodes: [node(1, null)],
      },
    });
  });

  it.each([1, 2] as const)("V%sではtreeDirectionとlayoutSpacingを無視する", (version) => {
    const legacy = JSON.stringify({
      version,
      layoutMode: "manual",
      treeDirection: "tb",
      layoutSpacing: { childGap: 100, siblingGap: 24 },
      nodes: [{
        id: 1,
        parentId: null,
        x: 0,
        y: 0,
        width: 160,
        height: 64,
        label: "a",
        ...(version === 1 ? {} : { importance: "medium" }),
      }],
    });
    const parsed = parseMapDocumentJson(legacy);
    expect(parsed.ok && "treeDirection" in parsed.value).toBe(false);
    expect(parsed.ok && "layoutSpacing" in parsed.value).toBe(false);
  });

  it("V3の不正なtreeDirectionを拒否する", () => {
    expect(parseMapDocumentJson(JSON.stringify({ ...baseDoc, treeDirection: "rl" }))).toEqual({
      ok: false,
      error: "treeDirectionはlrまたはtbである必要があります。",
    });
  });

  it("V3の不正なlayoutSpacingを拒否する", () => {
    expect(parseMapDocumentJson(JSON.stringify({ ...baseDoc, layoutSpacing: { childGap: 100 } }))).toEqual({
      ok: false,
      error: "layoutSpacingはchildGapとsiblingGapの両方を持つ必要があります。",
    });
  });
});

describe("version 3 の relations / groups", () => {
  const baseDoc = {
    version: 3,
    layoutMode: "manual" as const,
    nodes: [node(1, null), node(2, 1), node(3, 1)],
  };

  it("不正エントリを除去して文書は成功する（全体 corrupt にしない）", () => {
    const result = parseMapDocumentJson(JSON.stringify({
      ...baseDoc,
      relations: [
        { id: 10, fromId: 1, toId: 2, kind: "related", directed: false },
        { id: 11, fromId: 1, toId: 1, kind: "related", directed: false },
        { id: 12, fromId: 1, toId: 9, kind: "related", directed: false },
      ],
      groups: [
        { id: 20, nodeIds: [1, 2], label: "g" },
        { id: 21, nodeIds: [1], label: "" },
        { id: 22, nodeIds: [2, 3], label: "あ".repeat(101) },
      ],
    }));
    expect(result).toEqual({
      ok: true,
      value: {
        version: 3,
        layoutMode: "manual",
        nodes: [node(1, null), node(2, 1), node(3, 1)],
        relations: [{ id: 10, fromId: 1, toId: 2, kind: "related", directed: false }],
        groups: [{ id: 20, nodeIds: [1, 2], label: "g" }],
      },
    });
  });

  it("非配列の relations/groups はキーごと無視する", () => {
    const result = parseMapDocumentJson(JSON.stringify({
      ...baseDoc,
      relations: { id: 1 },
      groups: "x",
    }));
    expect(result.ok && "relations" in result.value).toBe(false);
    expect(result.ok && "groups" in result.value).toBe(false);
  });
});

describe("version 3 の locked", () => {
  it("trueだけを読み込み、falseは落とす", () => {
    const jsonValue = JSON.stringify({
      version: 3,
      layoutMode: "manual",
      nodes: [
        { ...node(1, null), locked: true },
        { ...node(2, 1), locked: false },
      ],
    });
    const parsed = parseMapDocumentJson(jsonValue);
    expect(parsed.ok && parsed.value.nodes[0].locked).toBe(true);
    expect(parsed.ok && "locked" in parsed.value.nodes[1]).toBe(false);
  });
});

describe("version 3 の layoutStyle / branchLayouts / layoutPinned", () => {
  const baseDoc = {
    version: 3,
    layoutMode: "manual" as const,
    nodes: [node(1, null), node(2, 1)],
  };

  it("radial と branchLayouts・layoutPinned を読み込む", () => {
    const result = parseMapDocumentJson(JSON.stringify({
      ...baseDoc,
      layoutStyle: "radial",
      branchLayouts: [{ nodeId: 2, direction: "rl" }],
      nodes: [
        { ...node(1, null), layoutPinned: true },
        { ...node(2, 1), layoutPinned: false },
      ],
    }));
    expect(result).toEqual({
      ok: true,
      value: {
        version: 3,
        layoutMode: "manual",
        layoutStyle: "radial",
        branchLayouts: [{ nodeId: 2, direction: "rl" }],
        nodes: [
          { ...node(1, null), layoutPinned: true },
          node(2, 1),
        ],
      },
    });
  });

  it("未知 layoutStyle はキー省略で文書成功、不正 branchLayouts エントリは除去", () => {
    const result = parseMapDocumentJson(JSON.stringify({
      ...baseDoc,
      layoutStyle: "grid",
      branchLayouts: [
        { nodeId: 2, direction: "rl" },
        { nodeId: 9, direction: "lr" },
        { nodeId: 1, direction: "grid" },
      ],
    }));
    expect(result.ok && "layoutStyle" in result.value).toBe(false);
    expect(result).toEqual({
      ok: true,
      value: {
        version: 3,
        layoutMode: "manual",
        nodes: [node(1, null), node(2, 1)],
        branchLayouts: [{ nodeId: 2, direction: "rl" }],
      },
    });
  });

  it("空の branchLayouts と orthogonal はキー省略", () => {
    const result = parseMapDocumentJson(JSON.stringify({
      ...baseDoc,
      layoutStyle: "orthogonal",
      branchLayouts: [],
    }));
    expect(result.ok && "layoutStyle" in result.value).toBe(false);
    expect(result.ok && "branchLayouts" in result.value).toBe(false);
  });
});

describe("version 3 の tour", () => {
  const baseDoc = {
    version: 3,
    layoutMode: "manual" as const,
    nodes: [node(1, null), node(2, 1)],
  };

  const stepSnapshot = {
    viewport: { offsetX: 0, offsetY: 0, scale: 1 },
    selectedNodeId: 1,
    selectedNodeIds: [1],
    focusRootId: null,
    collapsedNodeIds: [] as number[],
    resolutionMode: "all" as const,
    autoResolutionLevel: "all" as const,
  };

  it("不正 tour でもマップは開き、tour だけ落とす", () => {
    const result = parseMapDocumentJson(JSON.stringify({
      ...baseDoc,
      tour: { version: 2, title: "x", steps: [] },
    }));
    expect(result.ok).toBe(true);
    expect(result.ok && "tour" in result.value).toBe(false);
  });

  it("不正ステップを除外し caption 不正はキャプション無しで残す", () => {
    const result = parseMapDocumentJson(JSON.stringify({
      ...baseDoc,
      tour: {
        version: 1,
        title: "  案内  ",
        steps: [
          { id: "ok", snapshot: stepSnapshot, caption: "あ".repeat(501) },
          { id: "ok2", snapshot: stepSnapshot, caption: "" },
          { id: "", snapshot: stepSnapshot },
          { id: "bad", snapshot: { viewport: { offsetX: 0, offsetY: 0, scale: 0.01 } } },
        ],
      },
    }));
    expect(result).toEqual({
      ok: true,
      value: {
        ...baseDoc,
        tour: {
          version: 1,
          title: "案内",
          steps: [
            { id: "ok", snapshot: stepSnapshot },
            { id: "ok2", snapshot: stepSnapshot },
          ],
        },
      },
    });
  });

  it("51 件超は先頭 50 に切り詰める", () => {
    const steps = Array.from({ length: 51 }, (_, index) => ({
      id: `s${index}`,
      snapshot: stepSnapshot,
    }));
    const result = parseMapDocumentJson(JSON.stringify({
      ...baseDoc,
      tour: { version: 1, title: "long", steps },
    }));
    expect(result.ok && result.value.tour?.steps.length).toBe(50);
    expect(result.ok && result.value.tour?.steps[0]?.id).toBe("s0");
    expect(result.ok && result.value.tour?.steps[49]?.id).toBe("s49");
  });
});

describe("version 3 の learn", () => {
  const baseDoc = {
    version: 3,
    layoutMode: "manual" as const,
    nodes: [node(1, null), node(2, 1)],
  };

  it("不正 learn でもマップは開き、learn だけ落とす", () => {
    const result = parseMapDocumentJson(JSON.stringify({
      ...baseDoc,
      learn: { version: 2, revealedNodeIds: [1] },
    }));
    expect(result.ok).toBe(true);
    expect(result.ok && "learn" in result.value).toBe(false);
  });

  it("不正カードを除外し、revealed 欠落は空配列", () => {
    const result = parseMapDocumentJson(JSON.stringify({
      ...baseDoc,
      learn: {
        version: 1,
        cards: [
          { id: "ok", prompt: "p", answer: "a", sourceNodeIds: [2, 1] },
          { id: "", prompt: "p", answer: "a", sourceNodeIds: [1] },
        ],
      },
    }));
    expect(result).toEqual({
      ok: true,
      value: {
        ...baseDoc,
        learn: {
          version: 1,
          revealedNodeIds: [],
          cards: [{ id: "ok", prompt: "p", answer: "a", sourceNodeIds: [2, 1] }],
        },
      },
    });
  });

  it("101 件超は先頭 100 に切り詰める", () => {
    const cards = Array.from({ length: 101 }, (_, index) => ({
      id: `c${index}`,
      prompt: `p${index}`,
      answer: `a${index}`,
      sourceNodeIds: [1],
    }));
    const result = parseMapDocumentJson(JSON.stringify({
      ...baseDoc,
      learn: { version: 1, revealedNodeIds: [1], cards },
    }));
    expect(result.ok && result.value.learn?.cards?.length).toBe(100);
    expect(result.ok && result.value.learn?.cards?.[0]?.id).toBe("c0");
    expect(result.ok && result.value.learn?.cards?.[99]?.id).toBe("c99");
  });
});
