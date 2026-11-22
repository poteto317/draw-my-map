import {
  encodeNodePinsStore,
  withMapPins,
} from "@/domain/pins/pinsCodec";
import {
  createEmptyNodePins,
  createEmptyNodePinsStore,
  type NodePin,
  type NodePinsStore,
} from "@/domain/pins/pinsModel";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";
import {
  NODE_PINS_STORAGE_KEY,
  readPins,
  writePins,
} from "@/services/persistence/nodePinsStorage";

const SAMPLE_PIN: NodePin = {
  nodeId: 1,
  createdAt: "2026-11-22T00:00:00.000Z",
};

const SAMPLE_STORE: NodePinsStore = {
  version: 1,
  maps: {
    "map-1": [SAMPLE_PIN],
    "map-2": [{ nodeId: 7, createdAt: "2026-11-22T01:00:00.000Z" }],
  },
};

describe("nodePinsStorage", () => {
  it("ストレージキー定数が設計どおりである", () => {
    expect(NODE_PINS_STORAGE_KEY).toBe("draw-my-map.node-pins.v1");
  });

  describe("readPins", () => {
    it("キー未作成は空配列を status: ok・repaired: false で返し書き込まない（L-002 / L-461）", () => {
      const { storage, operations } = createRecordingStorage();
      const result = readPins(storage, "map-1");
      expect(result).toEqual({
        status: "ok",
        pins: createEmptyNodePins(),
        repaired: false,
      });
      expect(operations).toEqual([]);
      if (result.status !== "ok") return;
      result.pins.push(SAMPLE_PIN);
      expect(readPins(storage, "map-1")).toEqual({
        status: "ok",
        pins: [],
        repaired: false,
      });
    });

    it("保存済みマップのピンを読み取れる", () => {
      const { storage } = createRecordingStorage({
        initial: { [NODE_PINS_STORAGE_KEY]: encodeNodePinsStore(SAMPLE_STORE) },
      });
      expect(readPins(storage, "map-1")).toEqual({
        status: "ok",
        pins: [SAMPLE_PIN],
        repaired: false,
      });
    });

    it("未登録マップは空配列 ok（他マップは壊さない）", () => {
      const { storage } = createRecordingStorage({
        initial: { [NODE_PINS_STORAGE_KEY]: encodeNodePinsStore(SAMPLE_STORE) },
      });
      expect(readPins(storage, "map-missing")).toEqual({
        status: "ok",
        pins: [],
        repaired: false,
      });
    });

    it("破損データは corrupt を返し空成功にしない（L-002）", () => {
      const { storage, operations } = createRecordingStorage({
        initial: { [NODE_PINS_STORAGE_KEY]: "{broken" },
      });
      expect(readPins(storage, "map-1")).toEqual({ status: "corrupt" });
      expect(operations).toEqual([]);
      expect(storage.getItem(NODE_PINS_STORAGE_KEY)).toBe("{broken");
    });

    it("getItem 例外は read-error（L-002）", () => {
      const { storage } = createRecordingStorage({ failGetItem: true });
      expect(readPins(storage, "map-1")).toEqual({ status: "read-error" });
    });
  });

  describe("writePins", () => {
    it("書き込み成功。他マップのピンを消さない（L-921）", () => {
      const { storage, operations } = createRecordingStorage({
        initial: { [NODE_PINS_STORAGE_KEY]: encodeNodePinsStore(SAMPLE_STORE) },
      });
      const nextPins: NodePin[] = [
        SAMPLE_PIN,
        { nodeId: 3, createdAt: "2026-11-22T05:00:00.000Z" },
      ];
      expect(writePins(storage, "map-1", nextPins)).toEqual({ status: "ok" });
      expect(readPins(storage, "map-1")).toEqual({
        status: "ok",
        pins: nextPins,
        repaired: false,
      });
      expect(readPins(storage, "map-2")).toEqual({
        status: "ok",
        pins: SAMPLE_STORE.maps["map-2"],
        repaired: false,
      });
      expect(operations).toEqual([
        {
          type: "setItem",
          key: NODE_PINS_STORAGE_KEY,
          value: encodeNodePinsStore(
            withMapPins(SAMPLE_STORE, "map-1", nextPins),
          ),
        },
      ]);
    });

    it("空配列書き込みはマップ枠を落とし、別タブ追加分を最新読取で残す（L-921）", () => {
      const { storage } = createRecordingStorage({
        initial: {
          [NODE_PINS_STORAGE_KEY]: encodeNodePinsStore(
            withMapPins(createEmptyNodePinsStore(), "map-1", [SAMPLE_PIN]),
          ),
        },
      });
      // 別経路で map-2 を追加した状態をストレージに直接書く
      storage.setItem(
        NODE_PINS_STORAGE_KEY,
        encodeNodePinsStore(SAMPLE_STORE),
      );
      expect(writePins(storage, "map-1", [])).toEqual({ status: "ok" });
      expect(readPins(storage, "map-1")).toEqual({
        status: "ok",
        pins: [],
        repaired: false,
      });
      expect(readPins(storage, "map-2")).toEqual({
        status: "ok",
        pins: SAMPLE_STORE.maps["map-2"],
        repaired: false,
      });
    });

    it("容量超過は quota-exceeded。UI 確定更新しない前提の失敗を返す", () => {
      const { storage } = createRecordingStorage({
        failSetItem: () => true,
      });
      expect(writePins(storage, "map-1", [SAMPLE_PIN])).toEqual({
        status: "quota-exceeded",
      });
    });

    it("その他の書込失敗は write-error", () => {
      const { storage } = createRecordingStorage({
        failSetItem: () => true,
        failSetItemError: "SecurityError",
      });
      expect(writePins(storage, "map-1", [SAMPLE_PIN])).toEqual({
        status: "write-error",
      });
    });

    it("破損ストアへは書かず write-error（空で上書きしない）", () => {
      const { storage, operations } = createRecordingStorage({
        initial: { [NODE_PINS_STORAGE_KEY]: "{broken" },
      });
      expect(writePins(storage, "map-1", [SAMPLE_PIN])).toEqual({
        status: "write-error",
      });
      expect(operations).toEqual([]);
      expect(storage.getItem(NODE_PINS_STORAGE_KEY)).toBe("{broken");
    });
  });
});
