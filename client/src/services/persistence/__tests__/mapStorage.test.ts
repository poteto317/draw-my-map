import {
  MAP_STORAGE_KEY,
  readStoredMapJson,
  removeStoredMapJson,
  restoreStoredMapJson,
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

  describe("removeStoredMapJson", () => {
    it("固定キーを削除する", () => {
      const removeItem = jest.fn();

      expect(removeStoredMapJson({ removeItem })).toEqual({
        ok: true,
        value: undefined,
      });
      expect(removeItem).toHaveBeenCalledWith("draw-my-map.map.v1");
    });

    it("削除例外を利用者向けエラーへ変換する", () => {
      const removeItem = jest.fn(() => {
        throw new DOMException("blocked", "SecurityError");
      });

      expect(removeStoredMapJson({ removeItem })).toEqual({
        ok: false,
        error: "ブラウザの保存データを削除できませんでした。",
      });
    });
  });

  describe("restoreStoredMapJson", () => {
    it("固定キーへ元の文字列をそのまま書き戻す", () => {
      const setItem = jest.fn();

      expect(restoreStoredMapJson({ setItem }, "{\"version\":1}\n")).toEqual({
        ok: true,
        value: undefined,
      });
      expect(setItem).toHaveBeenCalledWith("draw-my-map.map.v1", "{\"version\":1}\n");
    });

    it("書き込み例外を利用者向けエラーへ変換する", () => {
      const setItem = jest.fn(() => {
        throw new DOMException("full", "QuotaExceededError");
      });

      expect(restoreStoredMapJson({ setItem }, "{}")).toEqual({
        ok: false,
        error: "ブラウザへ保存できませんでした。",
      });
    });
  });
});
