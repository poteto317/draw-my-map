import { readFileSync } from "node:fs";
import { join } from "node:path";
import { collectVisibleMapKeys } from "@/components/map/pixi/mapVisibilityKeys";
import { collectDepthVisibleNodeIds } from "@/domain/nodes/depthVisibility";
import {
  collectDisplayVisibleNodeIds,
  isCollapseFocusDepthVisible,
} from "@/domain/nodes/mapDisplayVisibility";
import { collectStructuralVisibleNodeIds } from "@/domain/nodes/mapPresenceVisibility";
import { createTestNode } from "@/testing/createTestNode";

describe("isCollapseFocusDepthVisible / display·structural 共有", () => {
  it("display と structural は同じ collapse∧focus∧depth predicate を共有する", () => {
    const displaySource = readFileSync(
      join(__dirname, "..", "mapDisplayVisibility.ts"),
      "utf8",
    );
    const presenceSource = readFileSync(
      join(__dirname, "..", "mapPresenceVisibility.ts"),
      "utf8",
    );
    expect(displaySource).toMatch(/export function isCollapseFocusDepthVisible/);
    expect(displaySource).toMatch(/isCollapseFocusDepthVisible\(id, structuralSets\)/);
    expect(presenceSource).toMatch(/isCollapseFocusDepthVisible/);
    expect(presenceSource).toMatch(
      /from "@\/domain\/nodes\/mapDisplayVisibility"/,
    );
    // structural 側にインラインの collapse∧focus∧depth が再実装されていないこと
    expect(presenceSource).not.toMatch(
      /collapseVisibleNodeIds\?\.has\(id\)\s*\?\?\s*true/,
    );
  });

  it("解像度が全通し・focusRoot 免除なしなら structural と display は一致する", () => {
    const candidates = [1, 2, 3, 4, 5];
    const sets = {
      collapseVisibleNodeIds: new Set([1, 2, 3]),
      focusVisibleNodeIds: new Set([2, 3, 4]),
      depthVisibleNodeIds: new Set([1, 2, 3, 4, 5]),
    };
    const structural = collectStructuralVisibleNodeIds(candidates, sets);
    const display = collectDisplayVisibleNodeIds(candidates, {
      ...sets,
      resolutionVisibleNodeIds: new Set(candidates),
      focusRootId: null,
    });
    expect([...display].sort((a, b) => a - b)).toEqual(
      [...structural].sort((a, b) => a - b),
    );
    for (const id of candidates) {
      expect(isCollapseFocusDepthVisible(id, sets)).toBe(structural.has(id));
    }
  });
});

describe("collectDisplayVisibleNodeIds", () => {
  const candidates = [1, 2, 3, 4, 5];
  const allDepth = new Set(candidates);

  it("折りたたみ・集中・解像度・深さの積集合を返し、集中先は解像度を免除する", () => {
    const visible = collectDisplayVisibleNodeIds(candidates, {
      collapseVisibleNodeIds: new Set([1, 2, 3, 4]),
      focusVisibleNodeIds: new Set([2, 3, 4, 5]),
      resolutionVisibleNodeIds: new Set([3, 4]),
      depthVisibleNodeIds: allDepth,
      focusRootId: 2,
    });

    expect([...visible]).toEqual([2, 3, 4]);
  });

  it("集中集合または折りたたみ集合が無いときはその条件を通す", () => {
    const withoutFocus = collectDisplayVisibleNodeIds(candidates, {
      collapseVisibleNodeIds: new Set([1, 2]),
      resolutionVisibleNodeIds: new Set([1, 2, 3]),
      depthVisibleNodeIds: allDepth,
      focusRootId: null,
    });
    const withoutCollapse = collectDisplayVisibleNodeIds(candidates, {
      focusVisibleNodeIds: new Set([2, 3]),
      resolutionVisibleNodeIds: new Set([2, 3, 4]),
      depthVisibleNodeIds: allDepth,
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
      depthVisibleNodeIds: new Set([10, 11]),
      focusRootId: 10,
    });

    expect([...visible]).toEqual([10, 11]);
  });

  it("深さ集合と他条件の積集合になる", () => {
    const visible = collectDisplayVisibleNodeIds(candidates, {
      collapseVisibleNodeIds: new Set([1, 2, 3, 4, 5]),
      resolutionVisibleNodeIds: new Set([1, 2, 3, 4, 5]),
      depthVisibleNodeIds: new Set([1, 2]),
      focusRootId: null,
    });

    expect([...visible]).toEqual([1, 2]);
  });

  it("深さ制限後の論理可視では両端可視の辺だけが残る", () => {
    const nodes = [
      createTestNode({ id: 1, parentId: null }),
      createTestNode({ id: 2, parentId: 1 }),
      createTestNode({ id: 3, parentId: 2 }),
    ];
    const depthVisibleNodeIds = collectDepthVisibleNodeIds(nodes, 1);
    const visible = collectDisplayVisibleNodeIds(nodes.map(({ id }) => id), {
      collapseVisibleNodeIds: new Set([1, 2, 3]),
      resolutionVisibleNodeIds: new Set([1, 2, 3]),
      depthVisibleNodeIds,
      focusRootId: null,
    });

    expect([...visible].sort((a, b) => a - b)).toEqual([1, 2]);
    expect([...collectVisibleMapKeys(nodes, visible)]).toEqual([
      "node:1",
      "node:2",
      "edge:2",
    ]);
  });
});
