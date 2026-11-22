import {
  createEmptyNodePins,
  createEmptyNodePinsStore,
  MAX_PINS_PER_MAP,
  pruneAbsentNodePins,
  type NodePin,
  type NodePinsStore,
} from "@/domain/pins/pinsModel";
import {
  decodeNodePinsStore,
  encodeNodePinsStore,
} from "@/domain/pins/pinsCodec";

const SAMPLE_PIN: NodePin = {
  nodeId: 1,
  createdAt: "2026-11-22T00:00:00.000Z",
};

const SAMPLE_STORE: NodePinsStore = {
  version: 1,
  maps: {
    "map-1": [SAMPLE_PIN],
  },
};

describe("pinsModel", () => {
  it("MAX_PINS_PER_MAP は 50", () => {
    expect(MAX_PINS_PER_MAP).toBe(50);
  });

  it("空配列・空ストアは毎回新しい参照を返す（L-461）", () => {
    const a = createEmptyNodePins();
    const b = createEmptyNodePins();
    expect(a).toEqual([]);
    expect(a).not.toBe(b);
    a.push(SAMPLE_PIN);
    expect(createEmptyNodePins()).toEqual([]);

    const s1 = createEmptyNodePinsStore();
    const s2 = createEmptyNodePinsStore();
    expect(s1).toEqual({ version: 1, maps: {} });
    expect(s1).not.toBe(s2);
    expect(s1.maps).not.toBe(s2.maps);
    s1.maps["x"] = [SAMPLE_PIN];
    expect(createEmptyNodePinsStore().maps).toEqual({});
  });

  it("pruneAbsentNodePins は存在しない nodeId を除去し repaired を返す", () => {
    const pins: NodePin[] = [
      SAMPLE_PIN,
      { nodeId: 99, createdAt: "2026-11-22T01:00:00.000Z" },
      { nodeId: 2, createdAt: "2026-11-22T02:00:00.000Z" },
    ];
    const result = pruneAbsentNodePins(pins, new Set([1, 2]));
    expect(result).toEqual({
      pins: [SAMPLE_PIN, { nodeId: 2, createdAt: "2026-11-22T02:00:00.000Z" }],
      repaired: true,
    });
    expect(pruneAbsentNodePins(pins, new Set([1, 2, 99]))).toEqual({
      pins,
      repaired: false,
    });
  });
});

describe("pinsCodec", () => {
  it("null は空ストア ok・repaired false", () => {
    expect(decodeNodePinsStore(null)).toEqual({
      status: "ok",
      store: createEmptyNodePinsStore(),
      repaired: false,
    });
  });

  it("保存済みストアを往復できる", () => {
    const encoded = encodeNodePinsStore(SAMPLE_STORE);
    expect(decodeNodePinsStore(encoded)).toEqual({
      status: "ok",
      store: SAMPLE_STORE,
      repaired: false,
    });
  });

  it("不正 JSON は corrupt（空成功にしない）", () => {
    expect(decodeNodePinsStore("{broken")).toEqual({ status: "corrupt" });
  });

  it("形が違うデータは corrupt", () => {
    expect(decodeNodePinsStore(JSON.stringify({ version: 2, maps: {} }))).toEqual({
      status: "corrupt",
    });
    expect(decodeNodePinsStore(JSON.stringify({ version: 1, maps: [] }))).toEqual({
      status: "corrupt",
    });
  });

  it("不正エントリ・重複 nodeId は除外して repaired", () => {
    const raw = JSON.stringify({
      version: 1,
      maps: {
        "map-1": [
          SAMPLE_PIN,
          { nodeId: "x", createdAt: "t" },
          { nodeId: 1, createdAt: "2026-11-22T03:00:00.000Z" },
          { nodeId: 2, createdAt: "2026-11-22T04:00:00.000Z" },
        ],
      },
    });
    expect(decodeNodePinsStore(raw)).toEqual({
      status: "ok",
      store: {
        version: 1,
        maps: {
          "map-1": [
            SAMPLE_PIN,
            { nodeId: 2, createdAt: "2026-11-22T04:00:00.000Z" },
          ],
        },
      },
      repaired: true,
    });
  });

  it("1 マップあたり 50 件超は corrupt", () => {
    const pins = Array.from({ length: MAX_PINS_PER_MAP + 1 }, (_, i) => ({
      nodeId: i + 1,
      createdAt: "2026-11-22T00:00:00.000Z",
    }));
    expect(
      decodeNodePinsStore(JSON.stringify({ version: 1, maps: { "map-1": pins } })),
    ).toEqual({ status: "corrupt" });
  });

  it("不正な mapId キーは除外して repaired", () => {
    const raw = JSON.stringify({
      version: 1,
      maps: {
        "bad id!": [SAMPLE_PIN],
        "map-1": [SAMPLE_PIN],
      },
    });
    expect(decodeNodePinsStore(raw)).toEqual({
      status: "ok",
      store: SAMPLE_STORE,
      repaired: true,
    });
  });
});
