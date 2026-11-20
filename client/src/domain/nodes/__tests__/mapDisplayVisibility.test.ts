import { collectDisplayVisibleNodeIds } from "@/domain/nodes/mapDisplayVisibility";

describe("collectDisplayVisibleNodeIds", () => {
  const candidates = [1, 2, 3, 4, 5];

  it("折りたたみ・集中・解像度の積集合を返し、集中先は解像度を免除する", () => {
    const visible = collectDisplayVisibleNodeIds(candidates, {
      collapseVisibleNodeIds: new Set([1, 2, 3, 4]),
      focusVisibleNodeIds: new Set([2, 3, 4, 5]),
      resolutionVisibleNodeIds: new Set([3, 4]),
      focusRootId: 2,
    });

    expect([...visible]).toEqual([2, 3, 4]);
  });

  it("集中集合または折りたたみ集合が無いときはその条件を通す", () => {
    const withoutFocus = collectDisplayVisibleNodeIds(candidates, {
      collapseVisibleNodeIds: new Set([1, 2]),
      resolutionVisibleNodeIds: new Set([1, 2, 3]),
      focusRootId: null,
    });
    const withoutCollapse = collectDisplayVisibleNodeIds(candidates, {
      focusVisibleNodeIds: new Set([2, 3]),
      resolutionVisibleNodeIds: new Set([2, 3, 4]),
      focusRootId: null,
    });

    expect([...withoutFocus]).toEqual([1, 2]);
    expect([...withoutCollapse]).toEqual([2, 3]);
  });

  it("集中先が解像度集合外でも可視にする", () => {
    const visible = collectDisplayVisibleNodeIds([10, 11], {
      collapseVisibleNodeIds: new Set([10, 11]),
      focusVisibleNodeIds: new Set([10, 11]),
      resolutionVisibleNodeIds: new Set([11]),
      focusRootId: 10,
    });

    expect([...visible]).toEqual([10, 11]);
  });
});
