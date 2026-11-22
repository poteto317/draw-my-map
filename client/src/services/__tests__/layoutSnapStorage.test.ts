import { DEFAULT_LAYOUT_SNAP_PREFS } from "@/domain/nodes/snapGrid";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";
import {
  encodeLayoutSnapPrefs,
  LAYOUT_SNAP_STORAGE_KEY,
  readSnapPrefs,
  writeSnapPrefs,
} from "@/services/layoutSnapStorage";

describe("layoutSnapStorage", () => {
  it("ストレージキー定数が設計どおりである", () => {
    expect(LAYOUT_SNAP_STORAGE_KEY).toBe("draw-my-map.layout-snap.v1");
  });

  describe("readSnapPrefs", () => {
    it("キー未作成は既定値 ok（L-921）", () => {
      const { storage, operations } = createRecordingStorage();
      expect(readSnapPrefs(storage)).toEqual({
        status: "ok",
        prefs: DEFAULT_LAYOUT_SNAP_PREFS,
      });
      expect(operations).toEqual([]);
    });

    it("保存済み設定を読み取れる", () => {
      const prefs = { enabled: false, showGrid: true, gridStep: 16 };
      const { storage } = createRecordingStorage({
        initial: {
          [LAYOUT_SNAP_STORAGE_KEY]: encodeLayoutSnapPrefs(prefs),
        },
      });
      expect(readSnapPrefs(storage)).toEqual({ status: "ok", prefs });
    });

    it("破損データは corrupt を返し空成功にしない（L-921）", () => {
      const { storage, operations } = createRecordingStorage({
        initial: { [LAYOUT_SNAP_STORAGE_KEY]: "{broken" },
      });
      expect(readSnapPrefs(storage)).toEqual({ status: "corrupt" });
      expect(operations).toEqual([]);
    });

    it("getItem 例外は read-error", () => {
      const { storage } = createRecordingStorage({ failGetItem: true });
      expect(readSnapPrefs(storage)).toEqual({ status: "read-error" });
    });
  });

  describe("writeSnapPrefs", () => {
    it("1 フィールド更新で他フィールドを維持する（L-921）", () => {
      const initial = { enabled: true, showGrid: false, gridStep: 12 };
      const { storage } = createRecordingStorage({
        initial: {
          [LAYOUT_SNAP_STORAGE_KEY]: encodeLayoutSnapPrefs(initial),
        },
      });
      expect(writeSnapPrefs(storage, { showGrid: true })).toEqual({ status: "ok" });
      expect(readSnapPrefs(storage)).toEqual({
        status: "ok",
        prefs: { ...initial, showGrid: true },
      });
    });

    it("gridStep は 4〜64 の倍数へクリップする", () => {
      const { storage } = createRecordingStorage();
      expect(writeSnapPrefs(storage, { gridStep: 10 })).toEqual({ status: "ok" });
      const read = readSnapPrefs(storage);
      expect(read).toEqual({
        status: "ok",
        prefs: { ...DEFAULT_LAYOUT_SNAP_PREFS, gridStep: 12 },
      });
    });

    it("容量超過は quota-exceeded", () => {
      const { storage } = createRecordingStorage({
        failSetItem: () => true,
      });
      expect(writeSnapPrefs(storage, { enabled: false })).toEqual({
        status: "quota-exceeded",
      });
    });

    it("破損ストアへは書かず write-error", () => {
      const { storage, operations } = createRecordingStorage({
        initial: { [LAYOUT_SNAP_STORAGE_KEY]: "{broken" },
      });
      expect(writeSnapPrefs(storage, { enabled: false })).toEqual({
        status: "write-error",
      });
      expect(operations).toEqual([]);
    });
  });
});