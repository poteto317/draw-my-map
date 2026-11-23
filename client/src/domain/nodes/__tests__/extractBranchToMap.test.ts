import { areMapStatesEqual } from "@/domain/history/mapHistory";
import { isDocumentContentEqual } from "@/domain/mapLibrary/mapConflict";
import { validateSubtreeClipboardNodes } from "@/domain/clipboard/subtreeClipboardCodec";
import { FALLBACK_NODE_LABEL } from "@/config/nodeLabel";
import { encodeSubtreeClipboard } from "@/domain/clipboard/subtreeClipboardCodec";
import {
  EXTRACT_BRANCH_DISPLAY_FALLBACK,
  buildExtractBranchDisplayLabel,
  buildExtractedMapName,
  extractBranchToNewMap,
} from "@/domain/nodes/extractBranchToMap";
import { createNodeIdAllocator } from "@/domain/nodes/nodeIdAllocator";
import { normalizeMapDocumentNode } from "@/domain/persistence/mapDocumentNode";
import { projectMapDocumentNode } from "@/domain/persistence/mapDocumentNodeProjection";
import { createTestNode } from "@/testing/createTestNode";
import type { MapDocumentV3 } from "@/types/mapDocument";
import type { NodeMapState } from "@/types/nodeMapState";

const SOURCE_MAP_ID = "map-src";
const NEW_MAP_ID = "map-new";
const SOURCE_MAP_NAME = "旅行の計画";
const manual = (nodes: ReturnType<typeof createTestNode>[]): NodeMapState => ({ layoutMode: "manual", nodes });

function extract(
  source: NodeMapState,
  rootId: number,
  target: NodeMapState = manual([]),
  sourceMapName: string = SOURCE_MAP_NAME,
) {
  const allocateIds = createNodeIdAllocator().nextAvailableIds;
  return extractBranchToNewMap({
    source,
    target,
    rootId,
    newMapId: NEW_MAP_ID,
    sourceMapId: SOURCE_MAP_ID,
    sourceMapName,
    allocateIds,
  });
}

describe("extractBranchToNewMap", () => {
  it("枝を新マップへ移し、元マップに mapLink スタブを兄弟位置へ挿入する", () => {
    const source = manual([
      createTestNode({ id: 1, parentId: null, label: "親" }),
      createTestNode({ id: 2, parentId: 1, label: "兄", x: 10, y: 10 }),
      createTestNode({ id: 3, parentId: 1, label: "枝", x: 20, y: 20 }),
      createTestNode({ id: 4, parentId: 3, label: "子" }),
      createTestNode({ id: 5, parentId: 1, label: "弟", x: 30, y: 30 }),
    ]);

    const result = extract(source, 3);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.newMapName).toBe(`${SOURCE_MAP_NAME} — 枝`);
    expect(result.target.nodes.map((n) => n.label)).toEqual(["枝", "子"]);
    expect(result.source.nodes.map((n) => n.label)).toEqual(["親", "兄", "枝", "弟"]);
    const stub = result.source.nodes.find((n) => n.id === result.stubNodeId)!;
    expect(stub).toMatchObject({
      parentId: 1,
      x: 20,
      y: 20,
      width: 100,
      height: 60,
      label: "枝",
      importance: "medium",
      mapLinks: [{ targetMapId: NEW_MAP_ID }],
    });
    expect(result.source.nodes.indexOf(stub)).toBe(2);
  });

  it("ルート直下の枝は拒否する", () => {
    const source = manual([
      createTestNode({ id: 1, parentId: null, label: "ルート" }),
      createTestNode({ id: 2, parentId: 1, label: "子" }),
    ]);
    expect(extract(source, 1)).toEqual({ ok: false, reason: "root-not-allowed" });
  });

  it("枝内が locked なら拒否する", () => {
    const lockedBranch = manual([
      createTestNode({ id: 1, parentId: null, label: "親" }),
      createTestNode({ id: 2, parentId: 1, label: "枝", locked: true }),
    ]);
    expect(extract(lockedBranch, 2)).toEqual({ ok: false, reason: "locked" });
  });

  it("マップルートが locked でもルート直下の枝は切り出せる", () => {
    const lockedRoot = manual([
      createTestNode({ id: 1, parentId: null, label: "ルート", locked: true }),
      createTestNode({ id: 2, parentId: 1, label: "枝" }),
    ]);
    expect(extract(lockedRoot, 2).ok).toBe(true);
  });

  it("ルート直下でない親が locked なら拒否する", () => {
    const lockedParent = manual([
      createTestNode({ id: 1, parentId: null, label: "ルート" }),
      createTestNode({ id: 2, parentId: 1, label: "親", locked: true }),
      createTestNode({ id: 3, parentId: 2, label: "枝" }),
    ]);
    expect(extract(lockedParent, 3)).toEqual({ ok: false, reason: "locked" });
  });

  it("空白ラベルはマップ名「無題の枝」・スタブ永続ラベル「新しいノード」", () => {
    const source = manual([
      createTestNode({ id: 1, parentId: null, label: "親" }),
      createTestNode({ id: 2, parentId: 1, label: "  \u3000" }),
    ]);
    const result = extract(source, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.newMapName).toBe(`${SOURCE_MAP_NAME} — ${EXTRACT_BRANCH_DISPLAY_FALLBACK}`);
    const stub = result.source.nodes.find((n) => n.id === result.stubNodeId)!;
    expect(stub.label).toBe(FALLBACK_NODE_LABEL);
  });

  it("L-825: スタブの mapLinks は投影・equal・clipboard の既存規則に乗る", () => {
    const source = manual([
      createTestNode({ id: 1, parentId: null, label: "親" }),
      createTestNode({ id: 2, parentId: 1, label: "枝" }),
    ]);
    const result = extract(source, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stub = result.source.nodes.find((n) => n.id === result.stubNodeId)!;
    expect(normalizeMapDocumentNode(projectMapDocumentNode(stub), 0, 3)).toEqual({ ok: true, value: stub });
  const doc = (node: typeof stub): MapDocumentV3 => ({ version: 3, layoutMode: "manual", nodes: [node] });
    expect(isDocumentContentEqual(doc(stub), doc({ ...stub, mapLinks: [{ ...stub.mapLinks![0] }] }))).toBe(true);
    expect(areMapStatesEqual(doc(stub), doc({ ...stub, mapLinks: [{ ...stub.mapLinks![0] }] }))).toBe(true);
    const clipboard = encodeSubtreeClipboard([stub], stub.id);
    expect(clipboard.ok).toBe(true);
    if (!clipboard.ok) return;
    expect(validateSubtreeClipboardNodes(JSON.parse(clipboard.value).nodes)).toEqual({
      ok: true,
      value: { nodes: [{ ...stub, parentId: null }], rootId: stub.id },
    });
  });
});

describe("buildExtractBranchDisplayLabel", () => {
  it("trim 後が空なら無題の枝", () => {
    expect(buildExtractBranchDisplayLabel("")).toBe(EXTRACT_BRANCH_DISPLAY_FALLBACK);
    expect(buildExtractBranchDisplayLabel("  ")).toBe(EXTRACT_BRANCH_DISPLAY_FALLBACK);
  });
});

describe("buildExtractedMapName", () => {
  it("50 コードポイントを超えない", () => {
    expect(Array.from(buildExtractedMapName("a".repeat(40), "ラベル")).length).toBeLessThanOrEqual(50);
  });

  it("長いラベルでも先頭が区切りだけにならず、先頭空白を付けない", () => {
    const longLabel = "あ".repeat(45);
    const name = buildExtractedMapName("", longLabel);
    expect(name).not.toMatch(/^\s*—/);
    expect(Array.from(name).length).toBeLessThanOrEqual(50);
    expect(/^\s/.test(name)).toBe(false);
  });

  it("長い表示ラベルでも元マップ名を先頭に残す", () => {
    const longLabel = "あ".repeat(47);
    const name = buildExtractedMapName(SOURCE_MAP_NAME, longLabel);
    expect(name.startsWith("—")).toBe(false);
    expect(name).not.toMatch(/^\s*—/);
    expect(name).toContain("旅行");
    expect(Array.from(name).length).toBeLessThanOrEqual(50);
  });

  it("制御文字を含むラベルは正規化する", () => {
    expect(buildExtractedMapName(SOURCE_MAP_NAME, "a\tb\nc\u007f")).toBe(`${SOURCE_MAP_NAME} — a b c`);
  });

  it("先頭空白のあるソース名は正規化する", () => {
    expect(buildExtractedMapName("  旅行の計画  ", "枝")).toBe("旅行の計画 — 枝");
  });
});

describe("extractBranchToNewMap のマップ名正規化", () => {
  it("長いラベルでも先頭空白・区切りだけの名前にならない", () => {
    const source = manual([
      createTestNode({ id: 1, parentId: null, label: "親" }),
      createTestNode({ id: 2, parentId: 1, label: "あ".repeat(45) }),
    ]);
    const result = extract(source, 2, manual([]), "");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.newMapName).not.toMatch(/^\s*—/);
    expect(Array.from(result.newMapName).length).toBeLessThanOrEqual(50);
    expect(/^\s/.test(result.newMapName)).toBe(false);
  });

  it("ラベルの制御文字はマップ名から正規化する", () => {
    const source = manual([
      createTestNode({ id: 1, parentId: null, label: "親" }),
      createTestNode({ id: 2, parentId: 1, label: "旅\t行" }),
    ]);
    const result = extract(source, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.newMapName).toBe(`${SOURCE_MAP_NAME} — 旅 行`);
  });
});