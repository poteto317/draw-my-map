import {
  arePresenceInputsComplete,
  collectPresenceEdgeChildIds,
  collectPresenceNodeIds,
  collectStructuralVisibleNodeIds,
} from "@/domain/nodes/mapPresenceVisibility";

describe("collectStructuralVisibleNodeIds", () => {
  const candidates = [1, 2, 3, 4, 5];
  const allDepth = new Set(candidates);

  it("折りたたみ・集中・深さの積集合を返し、解像度は見ない", () => {
    const visible = collectStructuralVisibleNodeIds(candidates, {
      collapseVisibleNodeIds: new Set([1, 2, 3, 4]),
      focusVisibleNodeIds: new Set([2, 3, 4, 5]),
      depthVisibleNodeIds: allDepth,
    });

    expect([...visible].sort((a, b) => a - b)).toEqual([2, 3, 4]);
  });

  it("collapse 除外のノードは structural に入らない", () => {
    const visible = collectStructuralVisibleNodeIds(candidates, {
      collapseVisibleNodeIds: new Set([1, 2]),
      focusVisibleNodeIds: allDepth,
      depthVisibleNodeIds: allDepth,
    });

    expect([...visible].sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it("集中集合または折りたたみ集合が無いときはその条件を通す", () => {
    const withoutFocus = collectStructuralVisibleNodeIds(candidates, {
      collapseVisibleNodeIds: new Set([1, 2]),
      depthVisibleNodeIds: allDepth,
    });
    const withoutCollapse = collectStructuralVisibleNodeIds(candidates, {
      focusVisibleNodeIds: new Set([2, 3]),
      depthVisibleNodeIds: allDepth,
    });
    const withNullFocus = collectStructuralVisibleNodeIds(candidates, {
      collapseVisibleNodeIds: new Set([1, 2, 3]),
      focusVisibleNodeIds: null,
      depthVisibleNodeIds: allDepth,
    });
    const withNullCollapse = collectStructuralVisibleNodeIds(candidates, {
      collapseVisibleNodeIds: null,
      focusVisibleNodeIds: new Set([2, 3]),
      depthVisibleNodeIds: allDepth,
    });

    expect([...withoutFocus].sort((a, b) => a - b)).toEqual([1, 2]);
    expect([...withoutCollapse].sort((a, b) => a - b)).toEqual([2, 3]);
    expect([...withNullFocus].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect([...withNullCollapse].sort((a, b) => a - b)).toEqual([2, 3]);
  });
});

describe("arePresenceInputsComplete", () => {
  const depth = new Set([1]);
  const display = new Set([1]);

  it("mode と depth/display が揃い、collapse/focus が null でも完備とみなす", () => {
    expect(arePresenceInputsComplete({
      mode: "auto",
      collapseVisibleNodeIds: null,
      focusVisibleNodeIds: null,
      depthVisibleNodeIds: depth,
      displayVisibleNodeIds: display,
    })).toBe(true);
  });

  it("depth または display が欠落、または mode が未定義なら非完備", () => {
    expect(arePresenceInputsComplete({
      mode: "auto",
      collapseVisibleNodeIds: null,
      focusVisibleNodeIds: null,
      depthVisibleNodeIds: undefined,
      displayVisibleNodeIds: display,
    })).toBe(false);

    expect(arePresenceInputsComplete({
      mode: "auto",
      collapseVisibleNodeIds: null,
      focusVisibleNodeIds: null,
      depthVisibleNodeIds: depth,
      displayVisibleNodeIds: undefined,
    })).toBe(false);

    expect(arePresenceInputsComplete({
      mode: null,
      collapseVisibleNodeIds: null,
      focusVisibleNodeIds: null,
      depthVisibleNodeIds: depth,
      displayVisibleNodeIds: display,
    })).toBe(false);

    expect(arePresenceInputsComplete({
      mode: undefined,
      collapseVisibleNodeIds: undefined,
      focusVisibleNodeIds: undefined,
      depthVisibleNodeIds: depth,
      displayVisibleNodeIds: display,
    })).toBe(false);
  });

  it("collapse または focus のみ undefined なら非完備", () => {
    expect(arePresenceInputsComplete({
      mode: "auto",
      collapseVisibleNodeIds: undefined,
      focusVisibleNodeIds: null,
      depthVisibleNodeIds: depth,
      displayVisibleNodeIds: display,
    })).toBe(false);

    expect(arePresenceInputsComplete({
      mode: "auto",
      collapseVisibleNodeIds: null,
      focusVisibleNodeIds: undefined,
      depthVisibleNodeIds: depth,
      displayVisibleNodeIds: display,
    })).toBe(false);
  });
});

describe("collectPresenceNodeIds", () => {
  it("auto + structural に medium、display 空 → presence に medium", () => {
    const structural = new Set([10, 20]);
    const display = new Set<number>();

    const presence = collectPresenceNodeIds(structural, display, "auto");

    expect([...presence].sort((a, b) => a - b)).toEqual([10, 20]);
  });

  it("auto + display に祖先のみ、medium 子孫が structural → medium のみ presence", () => {
    const ancestorId = 1;
    const mediumChildId = 2;
    const structural = new Set([ancestorId, mediumChildId]);
    const display = new Set([ancestorId]);

    const presence = collectPresenceNodeIds(structural, display, "auto");

    expect([...presence]).toEqual([mediumChildId]);
    expect(presence.has(ancestorId)).toBe(false);
  });

  it("auto 完備かつ structural − display が空 → 成功の空", () => {
    const ids = new Set([1, 2, 3]);
    const presence = collectPresenceNodeIds(ids, ids, "auto");

    expect(presence.size).toBe(0);
  });

  it("手動 high → 空", () => {
    const structural = new Set([1, 2, 3]);
    const display = new Set([1]);

    expect(collectPresenceNodeIds(structural, display, "high").size).toBe(0);
    expect(collectPresenceNodeIds(structural, display, "medium").size).toBe(0);
    expect(collectPresenceNodeIds(structural, display, "all").size).toBe(0);
  });

  it("欠落時は呼び出し側が collectPresenceNodeIds を呼ばずマーカー層をスキップする契約", () => {
    const incomplete = arePresenceInputsComplete({
      mode: "auto",
      collapseVisibleNodeIds: null,
      focusVisibleNodeIds: null,
      depthVisibleNodeIds: undefined,
      displayVisibleNodeIds: new Set([1]),
    });

    expect(incomplete).toBe(false);

    let called = false;
    const presenceOrSkip = (() => {
      if (!arePresenceInputsComplete({
        mode: "auto",
        collapseVisibleNodeIds: null,
        focusVisibleNodeIds: null,
        depthVisibleNodeIds: undefined,
        displayVisibleNodeIds: new Set([1]),
      })) {
        return null;
      }
      called = true;
      return collectPresenceNodeIds(new Set([1, 2]), new Set([1]), "auto");
    })();

    expect(presenceOrSkip).toBeNull();
    expect(called).toBe(false);
  });
});

describe("collectPresenceEdgeChildIds", () => {
  const nodes = [
    { id: 1, parentId: null as number | null },
    { id: 2, parentId: 1 },
    { id: 3, parentId: 1 },
  ];

  it("子が presence・親が structural・フル edge 無しなら child id を返す", () => {
    const presence = new Set([2]);
    const structural = new Set([1, 2, 3]);
    // 親のみ display → フル edge 無し
    const display = new Set([1]);

    expect(collectPresenceEdgeChildIds(nodes, presence, structural, display))
      .toEqual([2]);
  });

  it("フル edge がある親子には presence edge を出さない", () => {
    const presence = new Set([2]);
    const structural = new Set([1, 2]);
    // 子・親とも display = フル edge 相当（pixi キー文字列に依存しない）
    const display = new Set([1, 2]);

    expect(collectPresenceEdgeChildIds(nodes, presence, structural, display))
      .toEqual([]);
  });

  it("collapse で structural から外れた親の子は presence edge にならない", () => {
    const presence = new Set([2]);
    const structural = new Set([2]);
    const display = new Set<number>();

    expect(collectPresenceEdgeChildIds(nodes, presence, structural, display))
      .toEqual([]);
  });
});
