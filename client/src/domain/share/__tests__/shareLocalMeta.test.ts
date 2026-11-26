import {
  createEmptyShareLocalMetaStore,
  decodeShareLocalMetaStore,
  encodeShareLocalMetaStore,
  readShareLocalMetaForMap,
  removeShareLocalMetaForMap,
  upsertShareLocalMetaForMap,
  type ShareLocalMetaValue,
} from "@/domain/share/shareLocalMeta";

const SAMPLE: ShareLocalMetaValue = {
  sharedMapId: "sm-1",
  lastPublishedAt: "2026-11-26T00:00:00.000Z",
  linkActive: true,
};

describe("shareLocalMeta", () => {
  it("空ストアから mapId を読むと missing（未共有）", () => {
    expect(readShareLocalMetaForMap(createEmptyShareLocalMetaStore(), "map-1")).toEqual({
      status: "missing",
    });
  });

  it("upsert 後は present、remove で missing に戻る", () => {
    const store = upsertShareLocalMetaForMap(
      createEmptyShareLocalMetaStore(),
      "map-1",
      SAMPLE,
    );
    expect(readShareLocalMetaForMap(store, "map-1")).toEqual({
      status: "present",
      value: SAMPLE,
    });
    expect(readShareLocalMetaForMap(removeShareLocalMetaForMap(store, "map-1"), "map-1")).toEqual({
      status: "missing",
    });
  });

  it("null raw は空ストア、破損は corrupt（空成功にしない）", () => {
    expect(decodeShareLocalMetaStore(null)).toEqual({
      status: "ok",
      store: createEmptyShareLocalMetaStore(),
    });
    expect(decodeShareLocalMetaStore("{broken")).toEqual({ status: "corrupt" });
    expect(decodeShareLocalMetaStore(JSON.stringify({ version: 2, byMapId: {} }))).toEqual({
      status: "corrupt",
    });
  });

  it("往復で値を保持する", () => {
    const store = upsertShareLocalMetaForMap(
      createEmptyShareLocalMetaStore(),
      "map-a",
      { ...SAMPLE, linkActive: false, lastPublishedAt: null },
    );
    const decoded = decodeShareLocalMetaStore(encodeShareLocalMetaStore(store));
    expect(decoded).toEqual({ status: "ok", store });
  });
});
