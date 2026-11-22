import {
  listBuiltinTemplateSummaries,
  listBuiltinTemplates,
} from "@/domain/templates/builtinTemplates";
import { validateMapDocumentGraph } from "@/domain/persistence/mapDocumentGraph";
import { parseMapDocumentJson } from "@/domain/persistence/mapDocumentDecoder";
import { serializeMapDocument } from "@/domain/persistence/mapDocumentEncoder";
import type { Node } from "@/types/node";

const EXPECTED = [
  { id: "meeting-minutes", name: "議事録" },
  { id: "learning", name: "学習" },
  { id: "planning", name: "企画" },
  { id: "comparison", name: "比較検討" },
] as const;

function maxDepth(nodes: readonly Node[]): number {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let deepest = 0;
  for (const start of nodes) {
    let depth = 0;
    let current: Node | undefined = start;
    while (current) {
      depth += 1;
      current = current.parentId === null ? undefined : byId.get(current.parentId);
    }
    deepest = Math.max(deepest, depth);
  }
  return deepest;
}

describe("listBuiltinTemplateSummaries", () => {
  it("id と name だけを返し document は含まない", () => {
    const summaries = listBuiltinTemplateSummaries();
    expect(summaries).toEqual([...EXPECTED]);
    for (const summary of summaries) {
      expect(summary).not.toHaveProperty("document");
    }
  });
});

describe("listBuiltinTemplates", () => {
  it("議事録・学習・企画・比較検討の4種を返す", () => {
    const templates = listBuiltinTemplates();
    expect(templates.map((t) => ({ id: t.id, name: t.name }))).toEqual([...EXPECTED]);
  });

  it.each(EXPECTED.map((item) => [item.name, item.id] as const))(
    "%s テンプレは MapDocumentV3 で graph 妥当かつ浅い木である",
    (_name, id) => {
      const template = listBuiltinTemplates().find((item) => item.id === id);
      expect(template).toBeDefined();
      const { document } = template!;
      expect(document.version).toBe(3);
      expect(document.layoutMode).toBe("manual");
      expect(document.nodes.length).toBeGreaterThan(0);

      const graph = validateMapDocumentGraph(document.nodes);
      expect(graph.ok).toBe(true);

      const parsed = parseMapDocumentJson(serializeMapDocument(document));
      expect(parsed.ok).toBe(true);

      // 根 + 子までの浅い木（深さ 2 以下）
      expect(maxDepth(document.nodes)).toBeLessThanOrEqual(2);
      expect(document.nodes.some((node) => node.parentId === null)).toBe(true);
    },
  );

  it("呼び出しごとに新しい document / nodes を返す（共有参照を mutate させない）", () => {
    const first = listBuiltinTemplates();
    const second = listBuiltinTemplates();
    expect(first).not.toBe(second);
    expect(first[0].document).not.toBe(second[0].document);
    expect(first[0].document.nodes).not.toBe(second[0].document.nodes);
    first[0].document.nodes[0].label = "壊した";
    expect(second[0].document.nodes[0].label).not.toBe("壊した");
  });
});
