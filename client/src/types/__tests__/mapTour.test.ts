import {
  areMapToursEqual,
  normalizeTour,
  projectTour,
} from "@/types/mapTour";
import { createTestNode } from "@/testing/createTestNode";
import type { MapViewSnapshot } from "@/types/mapViewSnapshot";
import type { Node } from "@/types/node";

function snapshot(overrides: Partial<MapViewSnapshot> = {}): MapViewSnapshot {
  return {
    viewport: { offsetX: 0, offsetY: 0, scale: 1 },
    selectedNodeId: null,
    selectedNodeIds: [],
    focusRootId: null,
    collapsedNodeIds: [],
    resolutionMode: "all",
    autoResolutionLevel: "all",
    ...overrides,
  };
}

const nodes: readonly Node[] = [
  createTestNode({ id: 1, parentId: null, label: "root" }),
  createTestNode({ id: 2, parentId: 1, label: "child" }),
];

const validStep = {
  id: "step-a",
  snapshot: snapshot({ selectedNodeId: 1, selectedNodeIds: [1] }),
  caption: "見出し",
};

const validTour = {
  version: 1 as const,
  title: "ツアー",
  steps: [validStep],
};

describe("projectTour", () => {
  it("steps が 0 件なら tour キーを出さない", () => {
    expect(projectTour({ version: 1, title: "下書き", steps: [] })).toEqual({});
    expect(projectTour(undefined)).toEqual({});
  });

  it("有効な tour をそのまま載せる", () => {
    expect(projectTour(validTour)).toEqual({ tour: validTour });
  });
});

describe("normalizeTour", () => {
  const nodeIdSet = new Set(nodes.map((node) => node.id));

  it("往復できる tour を正規化する", () => {
    expect(normalizeTour(validTour, nodeIdSet, nodes)).toEqual(validTour);
  });

  it("version / title が不正なら tour 全体を落とす", () => {
    expect(normalizeTour({ version: 2, title: "x", steps: [validStep] }, nodeIdSet, nodes)).toBeUndefined();
    expect(normalizeTour({ version: 1, title: "  ", steps: [validStep] }, nodeIdSet, nodes)).toBeUndefined();
    expect(normalizeTour({ version: 1, title: "あ".repeat(81), steps: [validStep] }, nodeIdSet, nodes)).toBeUndefined();
    expect(normalizeTour("nope", nodeIdSet, nodes)).toBeUndefined();
  });

  it("不正ステップだけ除外し、残りが 0 なら tour を落とす", () => {
    const raw = {
      version: 1,
      title: "混在",
      steps: [
        validStep,
        { id: "", snapshot: snapshot() },
        { id: "bad-snap", snapshot: { viewport: { offsetX: 0, offsetY: 0, scale: 0.1 } } },
        null,
      ],
    };
    expect(normalizeTour(raw, nodeIdSet, nodes)).toEqual({
      version: 1,
      title: "混在",
      steps: [validStep],
    });
    expect(
      normalizeTour({ version: 1, title: "空", steps: [{ id: "", snapshot: snapshot() }] }, nodeIdSet, nodes),
    ).toBeUndefined();
  });

  it("caption 不正はキャプション無しでステップを残す", () => {
    const raw = {
      version: 1,
      title: "c",
      steps: [
        { id: "s1", snapshot: snapshot(), caption: "" },
        { id: "s2", snapshot: snapshot(), caption: "あ".repeat(501) },
        { id: "s3", snapshot: snapshot(), caption: 123 },
      ],
    };
    expect(normalizeTour(raw, nodeIdSet, nodes)).toEqual({
      version: 1,
      title: "c",
      steps: [
        { id: "s1", snapshot: snapshot() },
        { id: "s2", snapshot: snapshot() },
        { id: "s3", snapshot: snapshot() },
      ],
    });
  });

  it("51 件超は先頭 50 件に切り詰める", () => {
    const steps = Array.from({ length: 51 }, (_, index) => ({
      id: `s${index}`,
      snapshot: snapshot(),
    }));
    const normalized = normalizeTour({ version: 1, title: "many", steps }, nodeIdSet, nodes);
    expect(normalized?.steps.length).toBe(50);
    expect(normalized?.steps[0]?.id).toBe("s0");
    expect(normalized?.steps[49]?.id).toBe("s49");
  });
});

describe("areMapToursEqual", () => {
  it("未定義同士は等価", () => {
    expect(areMapToursEqual(undefined, undefined)).toBe(true);
  });

  it("内容差分を検出する", () => {
    expect(areMapToursEqual(undefined, validTour)).toBe(false);
    expect(
      areMapToursEqual(validTour, { ...validTour, title: "別" }),
    ).toBe(false);
    expect(
      areMapToursEqual(validTour, {
        ...validTour,
        steps: [{ ...validStep, caption: "変更" }],
      }),
    ).toBe(false);
  });

  it("同一内容なら等価", () => {
    expect(areMapToursEqual(validTour, { ...validTour, steps: [...validTour.steps] })).toBe(true);
  });
});