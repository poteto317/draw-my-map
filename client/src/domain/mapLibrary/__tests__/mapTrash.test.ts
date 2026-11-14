import type { MapIndexEntry } from "../mapIndex";
import { UNKNOWN_MAP_TIMESTAMP } from "../mapTimestamp";
import {
  TRASH_RETENTION_DAYS,
  TRASH_RETENTION_MS,
  addTrashEntry,
  calculateTrashRemainingDays,
  createMapTrashEntry,
  decodeMapTrashIndex,
  encodeMapTrashIndex,
  formatTrashRemainingDays,
  isTrashEntryExpired,
  partitionExpiredTrashEntries,
  removeTrashEntry,
  sortMapTrashEntriesForDisplay,
  type MapTrashEntry,
  type MapTrashIndexV1,
} from "../mapTrash";
import {
  TRASH_CORRUPT_MESSAGE,
  currentMapPermanentlyDeletedNotice,
  currentPermanentBodyRemovalFailedNotice,
  lastMapPermanentlyDeletedNotice,
  lastPermanentBodyRemovalFailedNotice,
  mapPermanentlyDeletedNotice,
  permanentBodyRemovalFailedNotice,
  trashBodyReadFailedForMoveNotice,
  trashCorruptClearFailedNotice,
  trashCorruptClearedNotice,
  trashCorruptForMoveNotice,
  trashCorruptNotice,
  trashEmptiedNotice,
  trashEmptyFailedNotice,
  trashEmptyPartialWarningNotice,
  trashEntryNotFoundNotice,
  trashEntryPermanentlyDeletedBodyWarningNotice,
  trashEntryPermanentlyDeletedNotice,
  trashMoveFailedNotice,
  trashMoveRollbackFailedNotice,
  trashPermanentDeleteFailedNotice,
  trashQuotaExceededNotice,
  trashRestoreBodyCorruptNotice,
  trashRestoreBodyMissingNotice,
  trashRestoreBodyReadFailedNotice,
  trashRestoreIndexChangedNotice,
  trashRestoreRollbackFailedNotice,
  trashRestoreWriteFailedNotice,
  trashRestoredCleanupFailedNotice,
  trashRestoredNotice,
} from "../mapTrashMessages";

function trashEntry(
  overrides: Partial<MapTrashEntry> & { id: string },
): MapTrashEntry {
  return {
    originalMapId: `orig-${overrides.id}`,
    name: `マップ${overrides.id}`,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-10T00:00:00.000Z",
    deletedAt: "2026-11-01T00:00:00.000Z",
    expiresAt: "2026-12-01T00:00:00.000Z",
    hasBody: true,
    ...overrides,
  };
}

function raw(value: unknown): string {
  return JSON.stringify(value);
}

describe("mapTrash constants", () => {
  it("保持日数は30日、保持ミリ秒は30日分", () => {
    expect(TRASH_RETENTION_DAYS).toBe(30);
    expect(TRASH_RETENTION_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe("decodeMapTrashIndex / encodeMapTrashIndex", () => {
  it.each([
    ["壊れた JSON", "{"],
    ["null", "null"],
    ["配列", "[]"],
    ["文字列", '"x"'],
    ["version 2", raw({ version: 2, items: [] })],
    ["items が配列でない", raw({ version: 1, items: {} })],
  ])("%s は corrupt", (_label, text) => {
    expect(decodeMapTrashIndex(text)).toEqual({ kind: "corrupt" });
  });

  it("正常な入力は repaired: false で、encode と decode で同じ値に戻る", () => {
    const index: MapTrashIndexV1 = {
      version: 1,
      items: [
        trashEntry({ id: "a", hasBody: true }),
        trashEntry({ id: "b", hasBody: false }),
      ],
    };
    const encoded = encodeMapTrashIndex(index);
    expect(encoded).toBe(JSON.stringify(index));
    expect(decodeMapTrashIndex(encoded)).toEqual({
      kind: "ok",
      index,
      repaired: false,
    });
  });

  it("空配列 items: [] は正常かつ repaired: false", () => {
    const index: MapTrashIndexV1 = { version: 1, items: [] };
    expect(decodeMapTrashIndex(encodeMapTrashIndex(index))).toEqual({
      kind: "ok",
      index,
      repaired: false,
    });
  });

  it("不正な行と重複 id を除外し repaired: true にする", () => {
    const valid = trashEntry({ id: "a" });
    const duplicate = trashEntry({ id: "a", name: "重複" });
    const result = decodeMapTrashIndex(
      raw({
        version: 1,
        items: [
          null,
          "x",
          1,
          [valid.id],
          { ...valid, id: "bad id" },
          { ...valid, originalMapId: "bad id" },
          { ...valid, name: 123 },
          { ...valid, hasBody: "yes" },
          valid,
          duplicate,
        ],
      }),
    );

    expect(result).toEqual({
      kind: "ok",
      index: { version: 1, items: [valid] },
      repaired: true,
    });
  });

  it("全行が不正でも外枠が正しければ空配列で repaired: true になる", () => {
    const result = decodeMapTrashIndex(
      raw({
        version: 1,
        items: [{ id: "bad id", name: "x" }],
      }),
    );

    expect(result).toEqual({
      kind: "ok",
      index: { version: 1, items: [] },
      repaired: true,
    });
  });

  it("name の正規化（空文字・制御文字・長さ超過）を行い repaired: true にする", () => {
    const emptyName = trashEntry({ id: "a", name: "   " });
    const controlName = trashEntry({ id: "b", name: "A\nB" });
    const longName = trashEntry({ id: "c", name: "あ".repeat(60) });
    const result = decodeMapTrashIndex(
      raw({
        version: 1,
        items: [emptyName, controlName, longName],
      }),
    );

    expect(result).toEqual({
      kind: "ok",
      index: {
        version: 1,
        items: [
          { ...emptyName, name: "無題のマップ" },
          { ...controlName, name: "A B" },
          { ...longName, name: "あ".repeat(50) },
        ],
      },
      repaired: true,
    });
  });

  it("不正な日時を UNKNOWN_MAP_TIMESTAMP に補正し repaired: true にする（両方不正なら期限切れ扱いしない）", () => {
    const broken = trashEntry({
      id: "a",
      createdAt: "invalid",
      updatedAt: "2026-10-10",
      deletedAt: "2026-11-01T00:00:00Z",
      expiresAt: "not-a-date",
    });
    const result = decodeMapTrashIndex(
      raw({
        version: 1,
        items: [broken],
      }),
    );

    expect(result).toEqual({
      kind: "ok",
      index: {
        version: 1,
        items: [
          {
            ...broken,
            createdAt: UNKNOWN_MAP_TIMESTAMP,
            updatedAt: UNKNOWN_MAP_TIMESTAMP,
            deletedAt: UNKNOWN_MAP_TIMESTAMP,
            expiresAt: UNKNOWN_MAP_TIMESTAMP,
          },
        ],
      },
      repaired: true,
    });
    if (result.kind === "ok") {
      expect(
        isTrashEntryExpired(
          result.index.items[0],
          new Date("2026-11-01T00:00:00.000Z"),
        ),
      ).toBe(false);
    }
  });

  it("expiresAt が欠落または不正でも deletedAt が有効なら deletedAt + 30日 で再計算し repaired: true にする", () => {
    const missingExpires = {
      id: "a",
      originalMapId: "orig-a",
      name: "マップa",
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-10T00:00:00.000Z",
      deletedAt: "2026-11-01T00:00:00.000Z",
      hasBody: true,
    };
    const invalidExpires = {
      ...missingExpires,
      id: "b",
      expiresAt: "not-a-date",
    };

    const result = decodeMapTrashIndex(
      raw({
        version: 1,
        items: [missingExpires, invalidExpires],
      }),
    );

    expect(result).toEqual({
      kind: "ok",
      index: {
        version: 1,
        items: [
          {
            ...missingExpires,
            expiresAt: "2026-12-01T00:00:00.000Z",
          },
          {
            ...invalidExpires,
            expiresAt: "2026-12-01T00:00:00.000Z",
          },
        ],
      },
      repaired: true,
    });
  });

  it("expiresAt が deletedAt + 30日 を超えるときは deletedAt + 30日 に直し repaired: true にする", () => {
    const now = new Date("2026-11-15T00:00:00.000Z");
    const futureDeleted = {
      id: "a",
      originalMapId: "orig-a",
      name: "マップa",
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-10T00:00:00.000Z",
      deletedAt: "2027-11-15T00:00:00.000Z",
      expiresAt: "2027-12-15T00:00:00.000Z",
      hasBody: true,
    };
    const farExpires = {
      ...futureDeleted,
      id: "b",
      deletedAt: "2026-11-01T00:00:00.000Z",
      expiresAt: "9999-12-31T00:00:00.000Z",
    };

    const result = decodeMapTrashIndex(
      raw({ version: 1, items: [futureDeleted, farExpires] }),
    );

    expect(result).toEqual({
      kind: "ok",
      index: {
        version: 1,
        items: [
          { ...futureDeleted, expiresAt: "2027-12-15T00:00:00.000Z" },
          { ...farExpires, expiresAt: "2026-12-01T00:00:00.000Z" },
        ],
      },
      repaired: true,
    });
    if (result.kind !== "ok") {
      throw new Error("unreachable");
    }
    const [first, second] = result.index.items;
    expect(formatTrashRemainingDays(first, now)).toBe("あと 30 日");
    expect(formatTrashRemainingDays(second, now)).toBe("あと 16 日");
  });

  it("未知キーは結果の MapTrashEntry に持ち込まない", () => {
    const valid = trashEntry({ id: "a" });
    const result = decodeMapTrashIndex(
      raw({
        version: 1,
        items: [{ ...valid, extraField: "ignored" }],
      }),
    );

    expect(result).toEqual({
      kind: "ok",
      index: { version: 1, items: [valid] },
      repaired: false,
    });
    if (result.kind === "ok") {
      expect(Object.keys(result.index.items[0]).sort()).toEqual(
        Object.keys(valid).sort(),
      );
    }
  });
});

describe("createMapTrashEntry", () => {
  it("元の MapIndexEntry と削除日時から30日後の expiresAt を持つエントリを作る", () => {
    const entry: MapIndexEntry = {
      id: "map-1",
      name: "企画メモ",
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-15T12:34:56.789Z",
    };
    const deletedAt = new Date("2026-11-01T00:00:00.000Z");

    expect(
      createMapTrashEntry({
        id: "trash-1",
        entry,
        deletedAt,
        hasBody: false,
      }),
    ).toEqual({
      id: "trash-1",
      originalMapId: "map-1",
      name: "企画メモ",
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-15T12:34:56.789Z",
      deletedAt: "2026-11-01T00:00:00.000Z",
      expiresAt: "2026-12-01T00:00:00.000Z",
      hasBody: false,
    });
  });
});

describe("isTrashEntryExpired / partitionExpiredTrashEntries", () => {
  it("expiresAt === now は期限切れ、1ms 後なら有効、UNKNOWN_MAP_TIMESTAMP と不正日時は期限切れ扱いしない", () => {
    const entry = trashEntry({
      id: "a",
      expiresAt: "2026-12-01T00:00:00.000Z",
    });

    expect(
      isTrashEntryExpired(entry, new Date("2026-12-01T00:00:00.000Z")),
    ).toBe(true);
    expect(
      isTrashEntryExpired(entry, new Date("2026-12-01T00:00:00.001Z")),
    ).toBe(true);
    expect(
      isTrashEntryExpired(entry, new Date("2026-11-30T23:59:59.999Z")),
    ).toBe(false);
    expect(
      isTrashEntryExpired(
        { ...entry, expiresAt: UNKNOWN_MAP_TIMESTAMP },
        new Date("2026-11-01T00:00:00.000Z"),
      ),
    ).toBe(false);
    expect(
      isTrashEntryExpired(
        { ...entry, expiresAt: "invalid" },
        new Date("2026-11-01T00:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("有効と期限切れに振り分ける", () => {
    const now = new Date("2026-11-15T00:00:00.000Z");
    const expired1 = trashEntry({
      id: "exp1",
      expiresAt: "2026-11-14T23:59:59.999Z",
    });
    const expired2 = trashEntry({
      id: "exp2",
      expiresAt: "2026-11-15T00:00:00.000Z",
    });
    const active1 = trashEntry({
      id: "act1",
      expiresAt: "2026-11-15T00:00:00.001Z",
    });
    const active2 = trashEntry({
      id: "act2",
      expiresAt: "2026-12-01T00:00:00.000Z",
    });

    expect(
      partitionExpiredTrashEntries([expired1, active1, expired2, active2], now),
    ).toEqual({
      active: [active1, active2],
      expired: [expired1, expired2],
    });
  });
});

describe("sortMapTrashEntriesForDisplay", () => {
  it("deletedAt 降順 → updatedAt 降順 → id 昇順で並べ、元配列を変更しない", () => {
    const a = trashEntry({
      id: "b",
      deletedAt: "2026-11-02T00:00:00.000Z",
      updatedAt: "2026-10-10T00:00:00.000Z",
    });
    const b = trashEntry({
      id: "a",
      deletedAt: "2026-11-02T00:00:00.000Z",
      updatedAt: "2026-10-10T00:00:00.000Z",
    });
    const c = trashEntry({
      id: "c",
      deletedAt: "2026-11-02T00:00:00.000Z",
      updatedAt: "2026-10-12T00:00:00.000Z",
    });
    const d = trashEntry({
      id: "d",
      deletedAt: "2026-11-03T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });

    const source = [a, b, c, d];
    const sorted = sortMapTrashEntriesForDisplay(source);

    expect(sorted.map((item) => item.id)).toEqual(["d", "c", "a", "b"]);
    expect(source.map((item) => item.id)).toEqual(["b", "a", "c", "d"]);
  });
});

describe("calculateTrashRemainingDays / formatTrashRemainingDays", () => {
  it("境界値と切り上げ、期限切れ表示を正しく計算する", () => {
    const entry = trashEntry({
      id: "a",
      expiresAt: "2026-12-01T00:00:00.000Z",
    });

    expect(
      calculateTrashRemainingDays(entry, new Date("2026-11-01T00:00:00.000Z")),
    ).toBe(30);
    expect(
      formatTrashRemainingDays(entry, new Date("2026-11-01T00:00:00.000Z")),
    ).toBe("あと 30 日");

    expect(
      calculateTrashRemainingDays(entry, new Date("2026-11-29T23:59:59.999Z")),
    ).toBe(2);
    expect(
      formatTrashRemainingDays(entry, new Date("2026-11-29T23:59:59.999Z")),
    ).toBe("あと 2 日");

    expect(
      calculateTrashRemainingDays(entry, new Date("2026-11-30T23:59:59.999Z")),
    ).toBe(1);
    expect(
      formatTrashRemainingDays(entry, new Date("2026-11-30T23:59:59.999Z")),
    ).toBe("あと 1 日");

    expect(
      calculateTrashRemainingDays(entry, new Date("2026-12-01T00:00:00.000Z")),
    ).toBe(0);
    expect(
      formatTrashRemainingDays(entry, new Date("2026-12-01T00:00:00.000Z")),
    ).toBe("期限切れ");

    expect(
      calculateTrashRemainingDays(
        { ...entry, expiresAt: UNKNOWN_MAP_TIMESTAMP },
        new Date("2026-11-01T00:00:00.000Z"),
      ),
    ).toBeNull();
    expect(
      formatTrashRemainingDays(
        { ...entry, expiresAt: UNKNOWN_MAP_TIMESTAMP },
        new Date("2026-11-01T00:00:00.000Z"),
      ),
    ).toBe("期限不明");
    expect(
      calculateTrashRemainingDays(
        { ...entry, expiresAt: "invalid" },
        new Date("2026-11-01T00:00:00.000Z"),
      ),
    ).toBeNull();
    expect(
      formatTrashRemainingDays(
        { ...entry, expiresAt: "invalid" },
        new Date("2026-11-01T00:00:00.000Z"),
      ),
    ).toBe("期限不明");
  });

  it("未来の deletedAt（時計が戻った端末）でも残り日数は最大 30 日に抑える", () => {
    const now = new Date("2026-11-15T00:00:00.000Z");
    const entry = trashEntry({
      id: "a",
      deletedAt: "2027-11-15T00:00:00.000Z",
      expiresAt: "2027-12-15T00:00:00.000Z",
    });

    expect(calculateTrashRemainingDays(entry, now)).toBe(TRASH_RETENTION_DAYS);
    expect(formatTrashRemainingDays(entry, now)).toBe("あと 30 日");
  });
});

describe("addTrashEntry / removeTrashEntry", () => {
  it("イミュータブルに項目を追加・削除する", () => {
    const a = trashEntry({ id: "a" });
    const b = trashEntry({ id: "b" });
    const initial: MapTrashIndexV1 = { version: 1, items: [a] };

    const added = addTrashEntry(initial, b);
    expect(added.items).toEqual([a, b]);
    expect(initial.items).toEqual([a]);

    const removed = removeTrashEntry(added, "a");
    expect(removed.items).toEqual([b]);
    expect(added.items).toEqual([a, b]);

    expect(removeTrashEntry(removed, "missing").items).toEqual([b]);
  });
});

describe("mapTrashMessages", () => {
  it("ゴミ箱移動失敗・容量不足・破損エラーは error", () => {
    expect(trashMoveFailedNotice().kind).toBe("error");
    expect(trashQuotaExceededNotice().kind).toBe("error");
    expect(trashBodyReadFailedForMoveNotice().kind).toBe("error");
    expect(trashCorruptForMoveNotice().kind).toBe("error");
    expect(trashMoveRollbackFailedNotice()).toEqual({
      kind: "error",
      message:
        "マップの削除に失敗し、ゴミ箱への移動の取り消しにも失敗しました。ページを再読み込みしてゴミ箱を確認してください。",
    });
    expect(trashCorruptNotice().kind).toBe("error");
    expect(trashCorruptNotice().message).toContain("ゴミ箱の読み込みに失敗しました");
  });

  it("TRASH_CORRUPT_MESSAGE は trashCorruptNotice().message と一致する", () => {
    expect(TRASH_CORRUPT_MESSAGE).toBe(
      "ゴミ箱の読み込みに失敗しました。ゴミ箱を空にして初期化してください。",
    );
    expect(trashCorruptNotice().message).toBe(TRASH_CORRUPT_MESSAGE);
  });

  it("復元通知は成功が status、部分失敗が warning、各種失敗が error", () => {
    expect(trashRestoredNotice("地図 A")).toEqual({
      kind: "status",
      message: "マップ「地図 A」をマップ一覧に復元しました。",
    });
    expect(trashRestoredCleanupFailedNotice("地図 A")).toEqual({
      kind: "warning",
      message:
        "マップ「地図 A」をマップ一覧に復元しましたが、ゴミ箱の後始末に失敗しました。",
    });
    expect(trashEntryNotFoundNotice()).toEqual({
      kind: "error",
      message: "対象のマップはゴミ箱に見つかりませんでした。",
    });
    expect(trashRestoreIndexChangedNotice()).toEqual({
      kind: "error",
      message:
        "マップ一覧が変更または更新されたため復元できませんでした。ページを再読み込みしてからやり直してください。",
    });
    expect(trashRestoreBodyReadFailedNotice().kind).toBe("error");
    expect(trashRestoreBodyMissingNotice().kind).toBe("error");
    expect(trashRestoreBodyCorruptNotice().kind).toBe("error");
    expect(trashRestoreWriteFailedNotice().kind).toBe("error");
    expect(trashRestoreRollbackFailedNotice().kind).toBe("error");
  });

  it("個別完全削除とゴミ箱を空にするの通知を定める", () => {
    expect(trashEntryPermanentlyDeletedNotice("地図 A")).toEqual({
      kind: "status",
      message: "マップ「地図 A」を完全に削除しました。",
    });
    expect(trashEntryPermanentlyDeletedBodyWarningNotice("地図 A").kind).toBe(
      "warning",
    );
    expect(trashPermanentDeleteFailedNotice().kind).toBe("error");

    expect(trashEmptiedNotice().kind).toBe("status");
    expect(trashEmptyPartialWarningNotice().kind).toBe("warning");
    expect(trashEmptyFailedNotice().kind).toBe("error");
    expect(trashCorruptClearedNotice().kind).toBe("status");
    expect(trashCorruptClearFailedNotice().kind).toBe("error");
  });

  it("フォールバック完全削除（permanentlyDeleteMap）の通知を定める", () => {
    expect(mapPermanentlyDeletedNotice("地図 A")).toEqual({
      kind: "status",
      message: "マップ「地図 A」を完全に削除しました。",
    });
    expect(currentMapPermanentlyDeletedNotice("地図 A", "地図 B")).toEqual({
      kind: "status",
      message: "マップ「地図 A」を完全に削除し、「地図 B」を開きました。",
    });
    expect(lastMapPermanentlyDeletedNotice("地図 A")).toEqual({
      kind: "status",
      message:
        "マップ「地図 A」を完全に削除し、新しい「無題のマップ」を作成しました。",
    });
    expect(permanentBodyRemovalFailedNotice("地図 A").kind).toBe("warning");
    expect(currentPermanentBodyRemovalFailedNotice("地図 A", "地図 B").kind).toBe(
      "warning",
    );
    expect(lastPermanentBodyRemovalFailedNotice("地図 A").kind).toBe("warning");
  });
});
