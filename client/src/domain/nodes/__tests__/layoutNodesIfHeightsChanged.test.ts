import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import {
  layoutNodesIfHeightsChanged,
  shouldLayoutAfterHeightFit,
} from "@/domain/nodes/layoutNodesIfHeightsChanged";
import { RECT_HEIGHT } from "@/config/shapes";
import { createTestNode } from "@/testing/createTestNode";

jest.mock("@/domain/nodes/nodeAutoLayout", () => {
  const actual = jest.requireActual<typeof import("@/domain/nodes/nodeAutoLayout")>(
    "@/domain/nodes/nodeAutoLayout",
  );
  return {
    ...actual,
    layoutNodeForest: jest.fn(actual.layoutNodeForest),
  };
});

const actualLayout = jest.requireActual<typeof import("@/domain/nodes/nodeAutoLayout")>(
  "@/domain/nodes/nodeAutoLayout",
).layoutNodeForest;

describe("shouldLayoutAfterHeightFit", () => {
  it("auto かつ高さ変化があるときだけ true", () => {
    const previous = [createTestNode({ id: 1, height: RECT_HEIGHT })];
    const fitted = [{ ...previous[0]!, height: 120 }];
    expect(shouldLayoutAfterHeightFit(previous, fitted, "auto")).toBe(true);
    expect(shouldLayoutAfterHeightFit(previous, fitted, "manual")).toBe(false);
    expect(shouldLayoutAfterHeightFit(previous, previous, "auto")).toBe(false);
  });
});

describe("layoutNodesIfHeightsChanged", () => {
  beforeEach(() => {
    jest.mocked(layoutNodeForest).mockImplementation(actualLayout);
    jest.mocked(layoutNodeForest).mockClear();
  });

  it("manual または高さ不変なら fitted を返し layout しない", () => {
    const previous = [createTestNode({ id: 1, height: RECT_HEIGHT })];
    const fitted = [{ ...previous[0]!, height: 120 }];
    expect(layoutNodesIfHeightsChanged(previous, fitted, "manual")).toBe(fitted);
    expect(layoutNodeForest).not.toHaveBeenCalled();

    expect(layoutNodesIfHeightsChanged(previous, previous, "auto")).toBe(previous);
    expect(layoutNodeForest).not.toHaveBeenCalled();
  });

  it("auto かつ高さ変化なら layoutNodeForest の結果を返す", () => {
    const previous = [
      createTestNode({ id: 1, parentId: null, x: 0, y: 0, height: RECT_HEIGHT }),
      createTestNode({ id: 2, parentId: 1, x: 200, y: 0, height: RECT_HEIGHT }),
    ];
    const fitted = [
      previous[0]!,
      { ...previous[1]!, height: 140 },
    ];
    const result = layoutNodesIfHeightsChanged(previous, fitted, "auto");
    expect(layoutNodeForest).toHaveBeenCalledWith(fitted, undefined);
    expect(result).toEqual(actualLayout(fitted));
  });

  it("layout 失敗時は null", () => {
    const previous = [createTestNode({ id: 1, height: RECT_HEIGHT })];
    const fitted = [{ ...previous[0]!, height: 120 }];
    jest.mocked(layoutNodeForest).mockReturnValueOnce(null);
    expect(layoutNodesIfHeightsChanged(previous, fitted, "auto")).toBeNull();
  });
});
