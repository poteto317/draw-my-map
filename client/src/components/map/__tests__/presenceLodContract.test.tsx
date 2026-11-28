import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderHook } from "@testing-library/react";
import { planPresenceMarkers } from "@/domain/nodes/planPresenceMarkers";
import { useMapDisplayState } from "@/hooks/useMapDisplayState";
import { useMapResolutionFilter } from "@/hooks/useMapResolutionFilter";
import { createTestNode } from "@/testing/createTestNode";

/**
 * 実 LOD 経路（scale→level→resolutionVisible→display）と MapEditor 配線の契約。
 * display 空の直指定だけでは、配線欠落（L-002 でマーカー無し）を見逃す。
 */
describe("presence LOD 契約", () => {
  it("scale→useMapResolutionFilter→display→planPresence で auto ズームアウト時にマーカー候補が非空", () => {
    const nodes = [
      createTestNode({ id: 1, parentId: null, importance: "high" }),
      createTestNode({ id: 2, parentId: 1, importance: "medium" }),
      createTestNode({ id: 3, parentId: 1, importance: "low" }),
    ];
    const structural = new Set([1, 2, 3]);

    const { result: resolution } = renderHook(() => useMapResolutionFilter({
      nodes,
      scale: 0.5,
      resetRevision: 0,
    }));
    expect(resolution.current).toMatchObject({ mode: "auto", level: "high" });
    expect([...resolution.current.visibleNodeIds]).toEqual([1]);

    const { result: display } = renderHook(() => useMapDisplayState({
      nodes,
      layoutMode: "manual",
      collapseVisibleNodeIds: structural,
      resolutionVisibleNodeIds: resolution.current.visibleNodeIds,
      depthVisibleNodeIds: structural,
      focusVisibleNodeIds: null,
    }));
    expect([...display.current.visibleNodeIds]).toEqual([1]);

    const plan = planPresenceMarkers({
      nodes,
      resolutionMode: resolution.current.mode,
      collapseVisibleNodeIds: structural,
      focusVisibleNodeIds: null,
      depthVisibleNodeIds: structural,
      displayVisibleNodeIds: display.current.visibleNodeIds,
    });

    expect(plan).not.toBeNull();
    expect(plan!.presenceNodeIds).toEqual(new Set([2, 3]));
    expect(plan!.presenceEdgeChildIds).toEqual([2, 3]);
  });

  it("MapEditor は presenceVisibility 1 オブジェクトで MapStage へ配線する", () => {
    const source = readFileSync(join(__dirname, "..", "MapEditor.tsx"), "utf8");
    expect(source).toMatch(/presenceVisibility=\{\{/);
    expect(source).toMatch(/resolutionMode:\s*resolutionFilter\.mode/);
    expect(source).toMatch(/collapseVisibleNodeIds:\s*branchCollapse\.collapseVisibleNodeIds/);
    expect(source).toMatch(/focusVisibleNodeIds,/);
    expect(source).toMatch(/depthVisibleNodeIds,/);
    expect(source).not.toMatch(/resolutionMode=\{resolutionFilter\.mode\}/);
    expect(source).not.toMatch(/collapseVisibleNodeIds=\{branchCollapse\.collapseVisibleNodeIds\}/);
  });
});
