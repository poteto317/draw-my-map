import {
  DOCK_SLOT_GROUP_ORDER,
  groupDockSlotDefs,
} from "@/domain/dock/groupDockSlotDefs";
import { listDockSlotDefs } from "@/domain/dock/dockSlotCatalog";

describe("groupDockSlotDefs", () => {
  it("グループ順は DOCK_SLOT_GROUP_ORDER に従う", () => {
    const groups = groupDockSlotDefs().map((entry) => entry.group);
    expect(groups).toEqual([...DOCK_SLOT_GROUP_ORDER]);
  });

  it("各グループの defs はカタログと同じ group だけを含む", () => {
    for (const entry of groupDockSlotDefs()) {
      expect(entry.defs.every((def) => def.group === entry.group)).toBe(true);
    }
  });

  it("全 defs を漏れなく1回ずつ含む", () => {
    const flat = groupDockSlotDefs().flatMap((entry) => entry.defs.map((d) => d.id));
    const catalogIds = listDockSlotDefs().map((d) => d.id);
    expect(flat).toEqual(catalogIds);
  });

  it("空グループは落とす", () => {
    const onlyEdit = listDockSlotDefs().filter((def) => def.group === "edit");
    expect(groupDockSlotDefs(onlyEdit).map((e) => e.group)).toEqual(["edit"]);
  });
});
