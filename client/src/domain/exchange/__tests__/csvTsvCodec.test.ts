import { encodeCsv, decodeCsv } from "@/domain/exchange/csvTsvCodec";
import { createTestNode } from "@/testing/createTestNode";
import type { ForestItem } from "@/domain/nodes/nodeForestInsertion";
import type { Node } from "@/types/node";

const HEADER = "id,parentId,label,importance,note,tags";

function node(id: number, parentId: number | null, overrides: Partial<Node> = {}): Node {
  return createTestNode({ id, parentId, label: `L${id}`, ...overrides });
}

describe("encodeCsv / decodeCsv", () => {
  it("固定ヘッダ列で属性を往復する", () => {
    const nodes = [
      node(1, null, { label: "Root", importance: "high", note: "n", tags: ["x", "y"] }),
      node(2, 1, { label: "Child", importance: "low" }),
    ];
    const text = encodeCsv(nodes, ",");
    expect(text.split("\n")[0]).toBe(HEADER);
    expect(decodeCsv(text, ",")).toEqual({
      ok: true,
      warnings: [],
      items: [
        { label: "Root", parentIndex: null, importance: "high", note: "n", tags: ["x", "y"] },
        { label: "Child", parentIndex: 0, importance: "low" },
      ],
    });
  });

  it("tags はセミコロン区切りでエンコードする", () => {
    const text = encodeCsv([node(1, null, { label: "T", tags: ["a;b", "c"] })], ",");
    expect(text).toContain("a\\;b");
    const decoded = decodeCsv(text, ",");
    expect(decoded.ok && decoded.items[0]?.tags).toEqual(["a;b", "c"]);
  });

  it("クォートとカンマを含むフィールドを RFC4180 風に扱う", () => {
    const nodes = [node(1, null, { label: 'Say "hi", friend', note: "line\n2" })];
    const text = encodeCsv(nodes, ",");
    const decoded = decodeCsv(text, ",");
    expect(decoded.ok && decoded.items[0]).toEqual({
      label: 'Say "hi", friend',
      parentIndex: null,
      importance: "medium",
      note: "line\n2",
    });
  });

  it("TSV 区切りを扱う", () => {
    const nodes = [node(1, null, { label: "A" }), node(2, 1, { label: "B" })];
    const text = encodeCsv(nodes, "\t");
    expect(text.startsWith("id\tparentId")).toBe(true);
    expect(decodeCsv(text, "\t").ok).toBe(true);
  });

  it("importance 不明値は medium にフォールバックし warning を出す", () => {
    const csv = `${HEADER}\n1,,X,weird,,`;
    const decoded = decodeCsv(csv, ",");
    expect(decoded).toEqual({
      ok: true,
      warnings: [expect.stringMatching(/importance/i)],
      items: [{ label: "X", parentIndex: null, importance: "medium" }],
    });
  });

  it("未知列は無視する", () => {
    const csv = `id,parentId,label,importance,note,tags,extra\n1,,Z,medium,,,ignored`;
    const decoded = decodeCsv(csv, ",");
    expect(decoded.ok && decoded.items[0]?.label).toBe("Z");
  });

  it("decode 結果にファイル id フィールドが無く parentIndex で親子が付く", () => {
    const csv = `${HEADER}\n10,,R,medium,,\n20,10,C,high,,`;
    const decoded = decodeCsv(csv, ",");
    expect(decoded).toEqual({
      ok: true,
      warnings: [],
      items: [
        { label: "R", parentIndex: null, importance: "medium" },
        { label: "C", parentIndex: 0, importance: "high" },
      ],
    });
    if (decoded.ok) {
      for (const item of decoded.items) {
        expect((item as ForestItem & { id?: unknown }).id).toBeUndefined();
      }
    }
  });

  it("ヘッダ欠落は拒否する", () => {
    expect(decodeCsv("1,,x", ",")).toEqual({ ok: false, reason: expect.any(String) });
  });

  it("閉じていないクォートは unclosed-quote で拒否する", () => {
    const csv = `${HEADER}\n1,,"broken,medium,,`;
    expect(decodeCsv(csv, ",")).toEqual({ ok: false, reason: "unclosed-quote" });
  });

  it("encode は式インジェクションになりうる先頭文字にタブを付ける", () => {
    const nodes = [
      node(1, null, { label: "=1+1", note: "-cmd", importance: "medium" }),
      node(2, 1, { label: "@evil", importance: "medium" }),
    ];
    const text = encodeCsv(nodes, ",");
    expect(text).toContain('\t=1+1');
    expect(text).toContain('\t-cmd');
    expect(text).toContain('\t@evil');
    const decoded = decodeCsv(text, ",");
    expect(decoded.ok && decoded.items[0]?.label).toBe("=1+1");
    expect(decoded.ok && decoded.items[0]?.note).toBe("-cmd");
    expect(decoded.ok && decoded.items[1]?.label).toBe("@evil");
  });

  it("同一 id の重複行は拒否する", () => {
    const csv = `${HEADER}\n1,,A,medium,,\n1,,B,medium,,`;
    expect(decodeCsv(csv, ",")).toEqual({
      ok: false,
      reason: '行3: id "1" が重複',
    });
  });
});