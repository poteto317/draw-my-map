import { resolveMapRelationGroupContextMenus } from "@/domain/map/mapRelationGroupContextMenus";
import { createTestNode } from "@/testing/createTestNode";
import type { MapRelation } from "@/types/mapRelation";

function relation(partial: Partial<MapRelation> & Pick<MapRelation, "id" | "fromId" | "toId">): MapRelation {
  return { kind: "related", directed: false, ...partial };
}

function input(
  overrides: Partial<Parameters<typeof resolveMapRelationGroupContextMenus>[0]> = {},
) {
  const nodes = [
    createTestNode({ id: 1, label: "a" }),
    createTestNode({ id: 2, parentId: 1, label: "b", x: 200 }),
    createTestNode({ id: 3, parentId: 1, label: "c", x: 200, y: 100 }),
  ];
  return {
    viewMode: "map" as const,
    isProtectedMode: false,
    hasConflict: false,
    isExternallyDeleted: false,
    menuNodeId: 1 as number | null,
    selectedNodeId: 1 as number | null,
    selectedNodeIds: [1] as readonly number[],
    nodes,
    relations: [relation({ id: 10, fromId: 1, toId: 2 })] as readonly MapRelation[] | undefined,
    ...overrides,
  };
}

describe("resolveMapRelationGroupContextMenus", () => {
  it("menuNodeId が null なら全メニュー非表示", () => {
    expect(resolveMapRelationGroupContextMenus(input({ menuNodeId: null }))).toEqual({
      relationAdd: { visible: false, disabled: false },
      relationConnect: { visible: false, disabled: false },
      groupCreate: { visible: false, disabled: false },
      branchGroup: { visible: false, disabled: false },
    });
  });

  it("単一選択ノードでは関連線追加と枝グループ化が見える", () => {
    const menus = resolveMapRelationGroupContextMenus(input());
    expect(menus.relationAdd.visible).toBe(true);
    expect(menus.relationConnect.visible).toBe(false);
    expect(menus.groupCreate.visible).toBe(false);
    expect(menus.branchGroup.visible).toBe(true);
  });

  it("2ノード選択では関連線で結ぶとグループ化が見える", () => {
    const menus = resolveMapRelationGroupContextMenus(input({
      selectedNodeId: 1,
      selectedNodeIds: [1, 2],
      menuNodeId: 2,
    }));
    expect(menus.relationConnect.visible).toBe(true);
    expect(menus.groupCreate.visible).toBe(true);
  });

  it("保護モードでは見えるメニューを disabled にする", () => {
    const menus = resolveMapRelationGroupContextMenus(input({
      isProtectedMode: true,
      selectedNodeIds: [1, 2],
      menuNodeId: 1,
    }));
    expect(menus.relationConnect).toEqual({ visible: true, disabled: true });
    expect(menus.groupCreate).toEqual({ visible: true, disabled: true });
  });
});
