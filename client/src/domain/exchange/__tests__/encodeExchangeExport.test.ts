import { encodeCsv } from "@/domain/exchange/csvTsvCodec";
import { encodeExchangeExport } from "@/domain/exchange/encodeExchangeExport";
import { encodeOpml } from "@/domain/exchange/opmlCodec";
import { createTestNode } from "@/testing/createTestNode";

const nodes = [
  createTestNode({ id: 1, parentId: null, label: "親" }),
  createTestNode({ id: 2, parentId: 1, label: "子" }),
];

describe("encodeExchangeExport", () => {
  it("フォーマットごとに codec を選ぶ", () => {
    expect(encodeExchangeExport(nodes, "opml")).toBe(encodeOpml(nodes));
    expect(encodeExchangeExport(nodes, "csv")).toBe(encodeCsv(nodes, ","));
    expect(encodeExchangeExport(nodes, "tsv")).toBe(encodeCsv(nodes, "\t"));
  });
});