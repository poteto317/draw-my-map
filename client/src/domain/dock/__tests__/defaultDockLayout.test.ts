import {
  createDefaultDockLayout,
  createDefaultDockVisibleSlotIds,
  normalizeDockLayout,
  normalizeDockVisibleSlotIds,
} from "@/domain/dock/defaultDockLayout";

describe("createDefaultDockLayout", () => {
  it("既定 visibleSlotIds を返す", () => {
    expect(createDefaultDockLayout()).toEqual({
      visibleSlotIds: createDefaultDockVisibleSlotIds(),
    });
  });
});

describe("normalizeDockVisibleSlotIds", () => {
  it("空・不正は既定へフォールバックする", () => {
    const defaults = createDefaultDockVisibleSlotIds();
    expect(normalizeDockVisibleSlotIds([])).toEqual(defaults);
    expect(normalizeDockVisibleSlotIds(null)).toEqual(defaults);
    expect(normalizeDockVisibleSlotIds(undefined)).toEqual(defaults);
    expect(normalizeDockVisibleSlotIds("undoRedo")).toEqual(defaults);
    expect(normalizeDockVisibleSlotIds([1, 2])).toEqual(defaults);
  });

  it("未知 ID を除去し、既知だけ残す", () => {
    expect(normalizeDockVisibleSlotIds([
      "undoRedo",
      "ghost-slot",
      "commandPalette",
    ])).toEqual(["undoRedo", "commandPalette"]);
  });

  it("既知がゼロ件になったら既定へ戻す", () => {
    expect(normalizeDockVisibleSlotIds(["ghost-a", "ghost-b"]))
      .toEqual(createDefaultDockVisibleSlotIds());
  });

  it("重複 ID は先勝ちで1つにする", () => {
    expect(normalizeDockVisibleSlotIds([
      "undoRedo",
      "commandPalette",
      "undoRedo",
    ])).toEqual(["undoRedo", "commandPalette"]);
  });
});

describe("normalizeDockLayout", () => {
  it("欠落・型不正・空 visible は createDefaultDockLayout()", () => {
    const defaults = createDefaultDockLayout();
    expect(normalizeDockLayout(undefined)).toEqual(defaults);
    expect(normalizeDockLayout(null)).toEqual(defaults);
    expect(normalizeDockLayout({})).toEqual(defaults);
    expect(normalizeDockLayout({ visibleSlotIds: [] })).toEqual(defaults);
    expect(normalizeDockLayout("x")).toEqual(defaults);
  });

  it("正常な visibleSlotIds を正規化する", () => {
    expect(normalizeDockLayout({
      visibleSlotIds: ["tour", "unknown", "collab"],
    })).toEqual({ visibleSlotIds: ["tour", "collab"] });
  });
});
