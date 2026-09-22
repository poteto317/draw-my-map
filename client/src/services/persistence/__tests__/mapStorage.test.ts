import {
  MAP_STORAGE_KEY,
  readStoredMapJson,
  writeStoredMapJson,
} from "@/services/persistence/mapStorage";

describe("mapStorage", () => {
  describe("readStoredMapJson", () => {
    it("保存値がない場合はnullを返す", () => {
      const getItem = jest.fn(() => null);

      expect(readStoredMapJson({ getItem })).toEqual({
        ok: true,
        value: null,
      });
      expect(getItem).toHaveBeenCalledWith("draw-my-map.map.v1");
    });

    it("固定キーの保存済みJSONを返す", () => {
      const getItem = jest.fn(() => "{\"version\":1}\n");

      expect(readStoredMapJson({ getItem })).toEqual({
        ok: true,
        value: "{\"version\":1}\n",
      });
      expect(MAP_STORAGE_KEY).toBe("draw-my-map.map.v1");
    });

    it("読み取り例外を利用者向けエラーへ変換する", () => {
      const getItem = jest.fn(() => {
        throw new DOMException("blocked", "SecurityError");
      });

      expect(readStoredMapJson({ getItem })).toEqual({
        ok: false,
        error: "ブラウザの保存データを読み取れませんでした。",
      });
    });
  });

  describe("writeStoredMapJson", () => {
    it("固定キーへJSONを保存する", () => {
      const setItem = jest.fn();

      expect(writeStoredMapJson({ setItem }, "{}\n")).toEqual({
        ok: true,
        value: undefined,
      });
      expect(setItem).toHaveBeenCalledWith("draw-my-map.map.v1", "{}\n");
    });

    it("書き込み例外を利用者向けエラーへ変換する", () => {
      const setItem = jest.fn(() => {
        throw new DOMException("full", "QuotaExceededError");
      });

      expect(writeStoredMapJson({ setItem }, "{}\n")).toEqual({
        ok: false,
        error: "ブラウザへ自動保存できませんでした。",
      });
    });
  });
});
