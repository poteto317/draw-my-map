import { createProtectedStorageSession } from "../protectedStorageSession";

describe("createProtectedStorageSession", () => {
  it("mapId と最初の値を返す", () => {
    const session = createProtectedStorageSession("map-1", '{"version":3}');

    expect(session.mapId).toBe("map-1");
    expect(session.readBody()).toEqual({ ok: true, value: '{"version":3}' });
  });

  it("最初の値が null なら null を返す", () => {
    const session = createProtectedStorageSession("map-1", null);

    expect(session.readBody()).toEqual({ ok: true, value: null });
  });

  it("writeBody は常に inactive で、後の readBody は最初の値のまま", () => {
    const session = createProtectedStorageSession("map-1", "first");

    expect(session.writeBody("second")).toEqual({ status: "inactive" });
    expect(session.writeBody("third")).toEqual({ status: "inactive" });
    expect(session.readBody()).toEqual({ ok: true, value: "first" });
  });

  it("registerFlush は flush を呼ばず、何もしない解除関数を返す", () => {
    const session = createProtectedStorageSession("map-1", null);
    const flush = jest.fn(() => ({ status: "saved" as const }));

    const unregister = session.registerFlush(flush);

    expect(typeof unregister).toBe("function");
    expect(() => unregister()).not.toThrow();
    expect(flush).not.toHaveBeenCalled();
  });
});
