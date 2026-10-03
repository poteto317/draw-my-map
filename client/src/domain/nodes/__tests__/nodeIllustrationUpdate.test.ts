import { ILLUSTRATED_NODE_HEIGHT } from "@/config/shapes";
import { replaceNodeIllustration } from "@/domain/nodes/nodeIllustrationUpdate";
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

  it("対象のノードが無いときは null", () => {
    expect(replaceNodeIllustration([node(1)], 9, URL1)).toBeNull();
  });
});
