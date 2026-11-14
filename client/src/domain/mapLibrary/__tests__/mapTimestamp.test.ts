process.env.TZ = "Asia/Tokyo";

import {
  formatMapDeletedAt,
  formatMapUpdatedAt,
  normalizeMapTimestamp,
  UNKNOWN_MAP_TIMESTAMP,
} from "../mapTimestamp";

describe("formatMapUpdatedAt", () => {
  it("ローカル時刻で日付をまたぐ値を組み立てる", () => {
    expect(formatMapUpdatedAt("2026-10-21T15:04:00.000Z")).toBe(
      "更新: 2026/10/22 00:04",
    );
    expect(formatMapUpdatedAt("2026-01-02T00:00:00.000Z")).toBe(
      "更新: 2026/01/02 09:00",
    );
  });

  it("不明な日時は「更新: 不明」にする", () => {
    expect(formatMapUpdatedAt(UNKNOWN_MAP_TIMESTAMP)).toBe("更新: 不明");
  });
});

describe("formatMapDeletedAt", () => {
  it("ローカル時刻で日付をまたぐ値を「削除: ...」として組み立てる", () => {
    expect(formatMapDeletedAt("2026-10-21T15:04:00.000Z")).toBe(
      "削除: 2026/10/22 00:04",
    );
    expect(formatMapDeletedAt("2026-01-02T00:00:00.000Z")).toBe(
      "削除: 2026/01/02 09:00",
    );
  });

  it("不明な日時や不正な文字列は「削除: 不明」にする", () => {
    expect(formatMapDeletedAt(UNKNOWN_MAP_TIMESTAMP)).toBe("削除: 不明");
    expect(formatMapDeletedAt("not-a-date")).toBe("削除: 不明");
  });
});

describe("normalizeMapTimestamp", () => {
  it("正しい日時はそのまま返す", () => {
    expect(normalizeMapTimestamp("2026-10-21T00:00:00.000Z")).toEqual({
      value: "2026-10-21T00:00:00.000Z",
      repaired: false,
    });
  });

  it.each(["not a date", 123, null, undefined])(
    "%p は不明な日時へ補正する",
    (value) => {
      expect(normalizeMapTimestamp(value)).toEqual({
        value: UNKNOWN_MAP_TIMESTAMP,
        repaired: true,
      });
    },
  );

  it.each([
    "2026",
    "2026-10-21",
    "Oct 21 2026",
    "2026-10-21T00:00:00Z",
    "2026-10-21T09:00:00.000+09:00",
  ])(
    "ISO 8601 の toISOString 形式でない %p は不明な日時へ補正する",
    (value) => {
      expect(normalizeMapTimestamp(value)).toEqual({
        value: UNKNOWN_MAP_TIMESTAMP,
        repaired: true,
      });
    },
  );

  it("不明な日時の値そのものは補正せずに返す", () => {
    expect(normalizeMapTimestamp(UNKNOWN_MAP_TIMESTAMP)).toEqual({
      value: UNKNOWN_MAP_TIMESTAMP,
      repaired: false,
    });
  });
});
