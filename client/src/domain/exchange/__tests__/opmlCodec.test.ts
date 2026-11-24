import { encodeOpml, decodeOpml } from "@/domain/exchange/opmlCodec";
import { createTestNode } from "@/testing/createTestNode";
import type { ForestItem } from "@/domain/nodes/nodeForestInsertion";
import type { Node } from "@/types/node";

function node(id: number, parentId: number | null, overrides: Partial<Node> = {}): Node {
  return createTestNode({ id, parentId, label: `L${id}`, ...overrides });
}

function roundTrip(nodes: readonly Node[]) {
  const xml = encodeOpml(nodes);
  return decodeOpml(xml);
}

describe("encodeOpml / decodeOpml", () => {
  it("階層と label／note を往復する", () => {
    const nodes = [
      node(1, null, { label: "Root", note: "根のメモ" }),
      node(2, 1, { label: "Child" }),
    ];
    const decoded = roundTrip(nodes);
    expect(decoded).toEqual({
      ok: true,
      items: [
        { label: "Root", parentIndex: null, note: "根のメモ" },
        { label: "Child", parentIndex: 0 },
      ],
    });
  });

  it("note が無いノードは _note を書かず復元も省略する", () => {
    const decoded = roundTrip([node(1, null, { label: "solo" })]);
    expect(decoded).toEqual({ ok: true, items: [{ label: "solo", parentIndex: null }] });
    expect(encodeOpml([node(1, null, { label: "solo" })])).not.toContain("_note");
  });

  it("tags や importance は OPML に載せない（lossy）", () => {
    const nodes = [node(1, null, { label: "T", importance: "high", tags: ["a", "b"] })];
    expect(encodeOpml(nodes)).not.toMatch(/tags|importance/i);
    const decoded = roundTrip(nodes);
    expect(decoded.ok && decoded.items[0]).toEqual({ label: "T", parentIndex: null });
  });

  it("未知の outline 属性は読み取りに影響しない", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0"><body>
  <outline text="A" _status="done"><outline text="B" foo="bar"/></outline>
</body></opml>`;
  expect(decodeOpml(xml)).toEqual({
    ok: true,
    items: [
      { label: "A", parentIndex: null },
      { label: "B", parentIndex: 0 },
    ],
  });
  });

  it("_note 属性が無いとき note 要素をフォールバックする", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0"><body>
  <outline text="A"><note>本文</note></outline>
</body></opml>`;
    expect(decodeOpml(xml)).toEqual({
      ok: true,
      items: [{ label: "A", parentIndex: null, note: "本文" }],
    });
  });

  it("不正 XML は拒否する", () => {
    expect(decodeOpml("<not-opml")).toEqual({ ok: false, reason: expect.any(String) });
    expect(decodeOpml("<opml><body></body></opml>").ok).toBe(false);
  });

  it("encode は label / note の非法 XML 制御文字を置換する", () => {
    const nodes = [node(1, null, { label: "A\u0000B", note: "n\u0007" })];
    const xml = encodeOpml(nodes);
    expect(xml).not.toContain("\u0000");
    expect(xml).not.toContain("\u0007");
    expect(decodeOpml(xml)).toEqual({
      ok: true,
      items: [{ label: "A\uFFFDB", parentIndex: null, note: "n\uFFFD" }],
    });
  });

  it("text が空のとき title 属性をラベルに使う", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0"><body>
  <outline title="From title"><outline text="Child"/></outline>
</body></opml>`;
    expect(decodeOpml(xml)).toEqual({
      ok: true,
      items: [
        { label: "From title", parentIndex: null },
        { label: "Child", parentIndex: 0 },
      ],
    });
  });

  it("一次元に深い outline ネストでもスタック溢出せず decode する", () => {
    const depth = 5_000;
    let nested = "";
    for (let index = 0; index < depth; index += 1) {
      nested = `<outline text="L${index}">${nested}</outline>`;
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?><opml><body>${nested}</body></opml>`;
    const decoded = decodeOpml(xml);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.items).toHaveLength(depth);
    expect(decoded.items[0]).toEqual({ label: `L${depth - 1}`, parentIndex: null });
    expect(decoded.items[depth - 1]).toEqual({ label: "L0", parentIndex: depth - 2 });
  });

  it("一次元に深いノード列でも encode してスタック溢出しない", () => {
    const depth = 5_000;
    const nodes = Array.from({ length: depth }, (_, index) =>
      node(index + 1, index === 0 ? null : index, { label: `N${index}` }),
    );
    expect(() => encodeOpml(nodes)).not.toThrow();
    const decoded = decodeOpml(encodeOpml(nodes));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.items).toHaveLength(depth);
  });

  it("decode 結果にファイル id 相当のフィールドが無い", () => {
    const decoded = decodeOpml(`<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0"><body><outline text="X"/></body></opml>`);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    for (const item of decoded.items) {
      expect(item).toEqual(expect.objectContaining({ label: expect.any(String), parentIndex: null }));
      expect((item as ForestItem & { id?: unknown }).id).toBeUndefined();
    }
  });
});