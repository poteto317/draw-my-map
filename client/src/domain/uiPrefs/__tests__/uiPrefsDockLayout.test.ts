import { createDefaultDockLayout } from "@/domain/dock/defaultDockLayout";
import {
  createDefaultUiPrefs,
  type UiPrefsV1,
} from "@/domain/uiPrefs/uiPrefsModel";
import { decodeUiPrefs, encodeUiPrefs } from "@/domain/uiPrefs/uiPrefsCodec";

describe("UiPrefsV1.dockLayout", () => {
  it("createDefaultUiPrefs は dockLayout に既定レイアウトを含む", () => {
    expect(createDefaultUiPrefs().dockLayout).toEqual(createDefaultDockLayout());
  });

  it("読込で dockLayout 欠落時は createDefaultDockLayout()", () => {
    const raw = JSON.stringify({
      version: 1,
      wheelZoomSensitivity: 0.004,
    });
    const result = decodeUiPrefs(raw);
    expect(result.prefs.dockLayout).toEqual(createDefaultDockLayout());
  });

  it("空の visibleSlotIds は既定へ正規化する", () => {
    const raw = JSON.stringify({
      version: 1,
      wheelZoomSensitivity: 0.004,
      dockLayout: { visibleSlotIds: [] },
    });
    const result = decodeUiPrefs(raw);
    expect(result.prefs.dockLayout).toEqual(createDefaultDockLayout());
    expect(result.repaired).toBe(true);
  });

  it("未知 ID を落として既知の並びを保つ", () => {
    const raw = JSON.stringify({
      version: 1,
      wheelZoomSensitivity: 0.004,
      dockLayout: {
        visibleSlotIds: ["undoRedo", "not-real", "tour"],
      },
    });
    const result = decodeUiPrefs(raw);
    expect(result.prefs.dockLayout).toEqual({
      visibleSlotIds: ["undoRedo", "tour"],
    });
    expect(result.repaired).toBe(true);
  });

  it("保存経路で空 visibleSlotIds を書かず、往復で既定になる", () => {
    const document: Record<string, unknown> = {
      version: 1,
      wheelZoomSensitivity: 0.004,
      dockLayout: { visibleSlotIds: [] },
    };
    const encoded = encodeUiPrefs(document);
    const parsed = JSON.parse(encoded) as {
      dockLayout: { visibleSlotIds: string[] };
    };
    expect(parsed.dockLayout.visibleSlotIds.length).toBeGreaterThan(0);
    expect(parsed.dockLayout).toEqual(createDefaultDockLayout());

    const roundTrip = decodeUiPrefs(encoded);
    expect(roundTrip.prefs.dockLayout).toEqual(createDefaultDockLayout());
  });

  it("カスタム dockLayout は往復で復元される", () => {
    const prefs: UiPrefsV1 = {
      version: 1,
      wheelZoomSensitivity: 0.004,
      dockLayout: { visibleSlotIds: ["undoRedo", "collab", "share"] },
    };
    const encoded = encodeUiPrefs({ ...prefs });
    const result = decodeUiPrefs(encoded);
    expect(result.prefs.dockLayout).toEqual({
      visibleSlotIds: ["undoRedo", "collab", "share"],
    });
  });
});
