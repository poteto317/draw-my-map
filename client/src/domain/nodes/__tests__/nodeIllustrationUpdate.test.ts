import { ILLUSTRATED_NODE_HEIGHT, RECT_HEIGHT } from "@/config/shapes";
import { clearNodeIllustration, replaceNodeIllustration } from "@/domain/nodes/nodeIllustrationUpdate";
import type { Node } from "@/types/node";

const URL1 = "data:image/jpeg;base64,AAAA";
const node = (id: number): Node => ({
  id, parentId: null, x: 0, y: 0, width: 100, height: 60, label: "a", importance: "medium",
});

describe("replaceNodeIllustration", () => {
  it("対象のノードにだけ、イラストを設定し、高さを伸ばす", () => {
    const result = replaceNodeIllustration([node(1), node(2)], 2, URL1)!;
    expect(result[0]).toEqual(node(1));
    expect(result[1]).toEqual({ ...node(2), illustration: URL1, height: ILLUSTRATED_NODE_HEIGHT });
  });

  it("入力の配列とノードを変更しない", () => {
    const nodes = [node(1)];
    replaceNodeIllustration(nodes, 1, URL1);
    expect(nodes[0]).toEqual(node(1));
  });

  it("既にイラストがあるノードは、置き換える（高さは変わらない）", () => {
    const first = replaceNodeIllustration([node(1)], 1, URL1)!;
    const second = replaceNodeIllustration(first, 1, "data:image/jpeg;base64,BBBB")!;
    expect(second[0].illustration).toBe("data:image/jpeg;base64,BBBB");
    expect(second[0].height).toBe(ILLUSTRATED_NODE_HEIGHT);
  });

  it.each(["", "javascript:alert(1)", "data:image/svg+xml;base64,AAAA", "data:image/jpeg;base64,<x>"])(
    "data URL として不正な値（%p）は null で、配列を変更しない",
    (bad) => {
      const nodes = [node(1)];
      expect(replaceNodeIllustration(nodes, 1, bad)).toBeNull();
      expect(nodes[0]).toEqual(node(1));
    },
  );

  it("対象のノードが無いときは null", () => {
    expect(replaceNodeIllustration([node(1)], 9, URL1)).toBeNull();
  });
});

describe("clearNodeIllustration", () => {
  it("対象のノードから illustration を外し、高さを RECT_HEIGHT に戻す", () => {
    const withImage = replaceNodeIllustration([node(1), node(2)], 2, URL1)!;
    const result = clearNodeIllustration(withImage, 2)!;
    expect(result[1].height).toBe(RECT_HEIGHT);
    expect(result[1]).toEqual(node(2));
    expect("illustration" in result[1]).toBe(false);
    expect(result[0]).toEqual(node(1));
  });

  it("他のノードと、入力の配列を変更しない", () => {
    const withImage = replaceNodeIllustration([node(1), node(2)], 2, URL1)!;
    const snapshot = JSON.parse(JSON.stringify(withImage));
    const result = clearNodeIllustration(withImage, 2)!;
    expect(withImage).toEqual(snapshot);
    expect(result[0]).toBe(withImage[0]);
  });

  it("対象のノードが無いとき、またはイラストが無いときは null", () => {
    expect(clearNodeIllustration([node(1)], 9)).toBeNull();
    expect(clearNodeIllustration([node(1)], 1)).toBeNull();
  });

  it("削除したあとにもう一度設定すると、元の状態に戻る（往復）", () => {
    const withImage = replaceNodeIllustration([node(1)], 1, URL1)!;
    const cleared = clearNodeIllustration(withImage, 1)!;
    expect(replaceNodeIllustration(cleared, 1, URL1)).toEqual(withImage);
  });
});
