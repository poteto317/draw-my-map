import { createNodeIdAllocator } from "@/domain/nodes/nodeIdAllocator";
import { insertNodeSubtree } from "@/domain/nodes/nodeSubtreeInsertion";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

function deepFreeze(nodes: Node[]): readonly Node[] {
  nodes.forEach((node) => Object.freeze(node));
  return Object.freeze(nodes);
}

function idsFrom(ids: number[]) {
  return jest.fn((_occupied: readonly Node[], count: number) => {
    if (count > ids.length) throw new Error("テスト用IDが不足しています。");
    return ids.slice(0, count);
  });
}

function findNode(nodes: readonly Node[], id: number): Node | undefined {
  return nodes.find((node) => node.id === id);
}

describe("insertNodeSubtree", () => {
  it("貼り付けではcurrentとIDが全件衝突しても全IDを再発行し根をnullにして子孫を対応付ける", () => {
    const current = deepFreeze([
      createTestNode({ id: 1, y: 0, height: 60, label: "既存1" }),
      createTestNode({ id: 2, parentId: 1, x: 200, y: 100, height: 200, label: "既存2" }),
      createTestNode({ id: 3, parentId: 2, x: 400, y: 0, height: 60, label: "既存3" }),
    ]);
    const sources = deepFreeze([
      createTestNode({
        id: 3, parentId: 2, x: 500, y: 150, width: 90, height: 50,
        label: "孫", importance: "low",
      }),
      createTestNode({
        id: 1, parentId: null, x: 100, y: 100, width: 160, height: 64,
        label: "根", importance: "high", illustration: "data:image/png;base64,root",
      }),
      createTestNode({
        id: 2, parentId: 1, x: 300, y: 200, width: 120, height: 100,
        label: "子", importance: "medium", illustration: "data:image/png;base64,child",
      }),
    ]);
    const currentBefore = current.map((node) => ({ ...node }));
    const sourcesBefore = sources.map((node) => ({ ...node }));
    const allocateIds = idsFrom([10, 11, 12]);

    const result = insertNodeSubtree(current, sources, 1, null, "manual", allocateIds, "paste");

    // 既存bottom=300、sourceMinY=100なのでdy=240。sourcesの配列順で採番する。
    expect(result).not.toBeNull();
    expect(result!.rootId).toBe(11);
    expect(result!.nodes.slice(3)).toEqual([
      {
        id: 10, parentId: 12, x: 500, y: 390, width: 90, height: 50,
        label: "孫", importance: "low",
      },
      {
        id: 11, parentId: null, x: 100, y: 340, width: 160, height: 64,
        label: "根", importance: "high", illustration: "data:image/png;base64,root",
      },
      {
        id: 12, parentId: 11, x: 300, y: 440, width: 120, height: 100,
        label: "子", importance: "medium", illustration: "data:image/png;base64,child",
      },
    ]);
    result!.nodes.slice(0, 3).forEach((node, index) => {
      expect(node).toBe(current[index]);
    });
    expect(result!.nodes).not.toBe(current);
    expect(current).toEqual(currentBefore);
    expect(sources).toEqual(sourcesBefore);
    expect(result!.nodes.slice(3).some((node) => sources.includes(node))).toBe(false);
    expect(allocateIds).toHaveBeenCalledTimes(1);
    expect(allocateIds).toHaveBeenCalledWith(current, 3);
  });

  it("根をtargetParentIdへつなぐ（複製では元の親を渡す）", () => {
    const current = deepFreeze([
      createTestNode({ id: 1, y: 0, height: 60 }),
      createTestNode({ id: 2, parentId: 1, x: 200, y: 0, height: 60 }),
    ]);
    const sources = [current[1]];

    const result = insertNodeSubtree(current, sources, 2, 1, "manual", idsFrom([10]), "duplicate");

    expect(result!.rootId).toBe(10);
    expect(findNode(result!.nodes, 10)).toMatchObject({ parentId: 1, x: 200, y: 100 });
  });

  it("根のparentIdがnull以外でも、targetParentIdがnullなら独立したルートにする", () => {
    const sources = deepFreeze([createTestNode({ id: 5, parentId: 4 })]);

    const result = insertNodeSubtree([], sources, 5, null, "auto", idsFrom([1]), "paste");

    expect(result!.nodes).toEqual([{ ...sources[0], id: 1, parentId: null }]);
  });

  it("手動配置で空のcurrentへ貼り付けると元の座標を維持する", () => {
    const sources = deepFreeze([
      createTestNode({ id: 1, x: -50, y: -70 }),
      createTestNode({ id: 2, parentId: 1, x: 150, y: 30 }),
    ]);

    const result = insertNodeSubtree([], sources, 1, null, "manual", idsFrom([7, 8]), "paste");

    expect(result!.nodes).toEqual([
      { ...sources[0], id: 7, parentId: null },
      { ...sources[1], id: 8, parentId: 7 },
    ]);
  });

  it("自動配置では座標を移動せずに候補を返す", () => {
    const current = deepFreeze([createTestNode({ id: 1, y: 0, height: 500 })]);
    const sources = deepFreeze([createTestNode({ id: 1, x: 30, y: 20 })]);

    const result = insertNodeSubtree(current, sources, 1, null, "auto", idsFrom([2]), "paste");

    expect(findNode(result!.nodes, 2)).toMatchObject({ parentId: null, x: 30, y: 20 });
  });

  it("続けて貼り付けると前回の貼り付けを含む新しい全体の下端の下へ追加する", () => {
    const current = deepFreeze([createTestNode({ id: 1, y: 0, height: 60 })]);
    const sources = deepFreeze([
      createTestNode({ id: 1, y: 0, height: 60 }),
      createTestNode({ id: 2, parentId: 1, x: 200, y: 50, height: 60 }),
    ]);
    const allocator = createNodeIdAllocator();

    const first = insertNodeSubtree(
      current, sources, 1, null, "manual", allocator.nextAvailableIds, "paste",
    );
    const second = insertNodeSubtree(
      first!.nodes, sources, 1, null, "manual", allocator.nextAvailableIds, "paste",
    );

    // 1回目: bottom=60でdy=100（y=100, 150）。2回目: bottom=210でdy=250（y=250, 300）。
    expect(first!.nodes.slice(1).map(({ y }) => y)).toEqual([100, 150]);
    expect(second!.nodes.slice(3).map(({ y }) => y)).toEqual([250, 300]);
    const ids = second!.nodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(second!.nodes[3]).toMatchObject({ id: second!.rootId, parentId: null });
    expect(second!.nodes[4].parentId).toBe(second!.rootId);
  });

  it("根がsourcesに無ければ採番せずnullを返す", () => {
    const allocateIds = idsFrom([10]);

    expect(insertNodeSubtree(
      [], deepFreeze([createTestNode({ id: 1 })]), 99, null, "auto", allocateIds, "paste",
    )).toBeNull();
    expect(allocateIds).not.toHaveBeenCalled();
  });

  describe("数値境界", () => {
    const existing = () => deepFreeze([createTestNode({ id: 1, y: 0, height: 0 })]);

    it.each([
      ["右端が非有限値になる", [], [
        createTestNode({ id: 1, x: Number.MAX_VALUE, width: Number.MAX_VALUE }),
      ]],
      ["下端が非有限値になる", [], [
        createTestNode({ id: 1, y: Number.MAX_VALUE, height: Number.MAX_VALUE }),
      ]],
      ["移動後の下端が非有限値になる", [createTestNode({ id: 1, y: 0, height: 0 })], [
        createTestNode({ id: 1, y: 0, height: 0 }),
        createTestNode({ id: 2, parentId: 1, y: Number.MAX_VALUE * 0.6, height: Number.MAX_VALUE * 0.6 }),
      ]],
      ["移動量が非有限値になる", [createTestNode({ id: 1, y: Number.MAX_VALUE, height: 0 })], [
        createTestNode({ id: 1, y: -Number.MAX_VALUE }),
      ]],
      ["丸めで40の間隔を確保できない", [createTestNode({ id: 1, y: 2 ** 60, height: 256 })], [
        createTestNode({ id: 1, y: 0 }),
      ]],
    ])("貼り付けの手動配置で%sときは採番せずnullを返す", (_name, current, sources) => {
      const allocateIds = idsFrom([10, 11]);

      expect(insertNodeSubtree(
        deepFreeze(current), deepFreeze(sources), 1, null, "manual", allocateIds, "paste",
      )).toBeNull();
      expect(allocateIds).not.toHaveBeenCalled();
    });

    it("貼り付けの自動配置では数値境界で拒否せずレイアウトへ任せる", () => {
      const sources = deepFreeze([
        createTestNode({ id: 1, x: Number.MAX_VALUE, width: Number.MAX_VALUE }),
      ]);

      expect(insertNodeSubtree(
        existing(), sources, 1, null, "auto", idsFrom([10]), "paste",
      )).not.toBeNull();
    });

    it("複製では右端の有限性を追加で検査せず従来どおり受け付ける", () => {
      const current = deepFreeze([
        createTestNode({ id: 1, y: 0, height: 0 }),
        createTestNode({ id: 2, parentId: 1, x: Number.MAX_VALUE, width: Number.MAX_VALUE, y: 0, height: 0 }),
      ]);

      const result = insertNodeSubtree(
        current, [current[1]], 2, 1, "manual", idsFrom([10]), "duplicate",
      );

      expect(findNode(result!.nodes, 10)).toMatchObject({ parentId: 1, y: 40 });
    });
  });

  it("深い枝を親より子が前の配列で受け取っても順序に依存せず親子を対応付ける", () => {
    const depth = 1_000;
    const sources = deepFreeze(Array.from({ length: depth }, (_, index) => {
      const id = depth - index;
      return createTestNode({ id, parentId: id === 1 ? null : id - 1, y: id });
    }));

    const result = insertNodeSubtree(
      [], sources, 1, null, "manual", createNodeIdAllocator().nextAvailableIds, "paste",
    );

    const copies = result!.nodes;
    const byId = new Map(copies.map((node) => [node.id, node]));
    // 元の各ノードと同じ位置の複製で、親の対応が元の親の複製を指す
    sources.forEach((source, index) => {
      const copy = copies[index];
      if (source.parentId === null) {
        expect(copy.parentId).toBeNull();
        expect(copy.id).toBe(result!.rootId);
      } else {
        expect(byId.get(copy.parentId!)!.y).toBe(source.parentId);
      }
    });
  });

  it("逆順の深い鎖と全件が衝突するIDでも配列要素とidの読み取り回数がノード数の定数倍に収まる", () => {
    const count = 10_000;
    const current = Array.from({ length: count }, (_, index) => (
      createTestNode({ id: index + 1, parentId: index === 0 ? null : index, y: index })
    ));
    const sources = Array.from({ length: count }, (_, index) => {
      const id = count - index;
      return createTestNode({ id, parentId: id === 1 ? null : id - 1, y: id });
    });
    let elementReads = 0;
    let idReads = 0;
    function observe(nodes: Node[]): Node[] {
      const observedElements = nodes.map((target) => new Proxy(target, {
        get(innerTarget, property, receiver) {
          if (property === "id") idReads += 1;
          return Reflect.get(innerTarget, property, receiver);
        },
      }));
      return new Proxy(observedElements, {
        get(target, property, receiver) {
          if (typeof property === "string" && /^\d+$/.test(property)) elementReads += 1;
          return Reflect.get(target, property, receiver);
        },
      });
    }

    const result = insertNodeSubtree(
      observe(current),
      observe(sources),
      1,
      null,
      "manual",
      createNodeIdAllocator().nextAvailableIds,
      "paste",
    );

    expect(result!.nodes).toHaveLength(count * 2);
    const totalNodes = count * 2;
    expect(elementReads).toBeLessThanOrEqual(totalNodes * 8);
    expect(idReads).toBeLessThanOrEqual(totalNodes * 8);
  });
});
