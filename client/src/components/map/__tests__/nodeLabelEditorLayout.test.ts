import { getNodeLabelEditorLayout } from "@/components/map/nodeLabelEditorLayout";
import type { Node } from "@/types/node";

describe("getNodeLabelEditorLayout", () => {
  it("viewportに合わせて編集欄の位置と寸法を投影する", () => {
    const node: Node = {
      id: 1,
      parentId: null,
      x: 10,
      y: 20,
      width: 100,
      height: 60,
      label: "node",
      importance: "medium" as const,
    };

    expect(getNodeLabelEditorLayout(
      node,
      { offsetX: 5, offsetY: -5, scale: 2 },
    )).toEqual({
      left: 25,
      top: 35,
      width: 200,
      height: 120,
      lineHeight: "120px",
      fontSize: 28,
    });
  });
});
