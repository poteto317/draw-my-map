import {
  ILLUSTRATED_NODE_HEIGHT,
  ILLUSTRATION_AREA_HEIGHT,
  ILLUSTRATION_SIZE,
  ILLUSTRATION_TOP_PADDING,
  RECT_HEIGHT,
} from "@/config/shapes";
import { getNodeIllustrationRect, getNodeLabelCenterOffset } from "@/domain/nodes/nodeIllustration";

describe("ノードのイラストの配置", () => {
  it("定数が整合している", () => {
    expect(ILLUSTRATION_AREA_HEIGHT).toBe(ILLUSTRATION_TOP_PADDING + ILLUSTRATION_SIZE);
    expect(ILLUSTRATED_NODE_HEIGHT).toBe(RECT_HEIGHT + ILLUSTRATION_AREA_HEIGHT);
  });

  it("イラストは、ノードの上部の中央に置く", () => {
    expect(getNodeIllustrationRect({ x: 10, y: 20, width: 100 })).toEqual({
      x: 10 + (100 - ILLUSTRATION_SIZE) / 2,
      y: 20 + ILLUSTRATION_TOP_PADDING,
      size: ILLUSTRATION_SIZE,
    });
  });

  it("イラストが無いノードは、従来どおり、高さの半分がテキストの中心", () => {
    expect(getNodeLabelCenterOffset({ height: 60 })).toBe(30);
  });

  it("イラストがあるノードは、イラストの下の領域の中央がテキストの中心", () => {
    // 下の領域 = 116 - 56 = 60、その中央 = 56 + 30 = 86
    expect(getNodeLabelCenterOffset({ height: ILLUSTRATED_NODE_HEIGHT, illustration: "data:image/png;base64,AAAA" })).toBe(86);
  });
});
