import { moveVisibleDockSlot } from "@/domain/dock/moveVisibleDockSlot";
import type { DockSlotId } from "@/domain/dock/dockSlotCatalog";

describe("moveVisibleDockSlot", () => {
  const ids: DockSlotId[] = ["undoRedo", "commandPalette", "importance"];

  it("前へ移す", () => {
    expect(moveVisibleDockSlot(ids, "commandPalette", -1)).toEqual([
      "commandPalette",
      "undoRedo",
      "importance",
    ]);
  });

  it("後へ移す", () => {
    expect(moveVisibleDockSlot(ids, "undoRedo", 1)).toEqual([
      "commandPalette",
      "undoRedo",
      "importance",
    ]);
  });

  it("先頭で前へ／末尾で後へは null", () => {
    expect(moveVisibleDockSlot(ids, "undoRedo", -1)).toBeNull();
    expect(moveVisibleDockSlot(ids, "importance", 1)).toBeNull();
  });

  it("一覧に無い ID は null", () => {
    expect(moveVisibleDockSlot(ids, "collab", 1)).toBeNull();
  });

  it("元配列を変異しない", () => {
    const before = [...ids];
    moveVisibleDockSlot(ids, "commandPalette", 1);
    expect(ids).toEqual(before);
  });
});
