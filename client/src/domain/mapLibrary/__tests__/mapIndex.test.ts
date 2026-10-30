import {
  addMapEntry,
  compareMapEntriesForDisplay,
  createMapIndexEntry,
  createSingleMapIndex,
  decodeMapIndex,
  describeMapRemoval,
  encodeMapIndex,
  findMapEntry,
  isValidMapId,
  pickUnusedMapId,
  removeMapEntry,
  renameMapEntry,
  replaceLastMapEntry,
  selectNextMapAfterRemoval,
  setCurrentMap,
  sortMapEntriesForDisplay,
  touchMapEntry,
  withLegacyCleanupPending,
  type MapIndexEntry,
  type MapIndexV1,
} from "../mapIndex";
import { UNKNOWN_MAP_TIMESTAMP } from "../mapTimestamp";

function entry(
  id: string,
  updatedAt: string,
  createdAt = "2026-10-01T00:00:00.000Z",
  name = `マップ${id}`,
): MapIndexEntry {
  return { id, name, createdAt, updatedAt };
}

function indexOf(
  maps: MapIndexEntry[],
  currentMapId: string,
  legacyCleanupPending = false,
): MapIndexV1 {
  return { version: 1, currentMapId, maps, legacyCleanupPending };
}

const A = entry("A", "2026-10-21T10:00:00.000Z");
const B = entry("B", "2026-10-21T12:00:00.000Z");
const C = entry("C", "2026-10-21T11:00:00.000Z");

function raw(value: unknown): string {
  return JSON.stringify(value);
}

describe("isValidMapId", () => {
  it.each(["a", "A_b-9", "a".repeat(64)])("%p は有効", (id) => {
    expect(isValidMapId(id)).toBe(true);
  });

  it.each(["", "bad id", "a".repeat(65), "a.b", "日本語", 1, null, undefined])(
    "%p は無効",
    (id) => {
      expect(isValidMapId(id)).toBe(false);
    },
  );
});

describe("decodeMapIndex", () => {
  it.each([
    ["壊れた JSON", "{"],
    ["null", "null"],
    ["配列", "[]"],
    ["文字列", '"x"'],
    ["version 2", raw({ version: 2, currentMapId: "A", maps: [A] })],
    ["maps が配列でない", raw({ version: 1, currentMapId: "A", maps: {} })],
    [
      "有効な項目が0件",
      raw({
        version: 1,
        currentMapId: "A",
        maps: [{ id: "bad id", name: "x" }],
      }),
    ],
  ])("%s は corrupt", (_label, text) => {
    expect(decodeMapIndex(text)).toEqual({ kind: "corrupt" });
  });

  it("正常な入力は repaired: false で、encode と decode で同じ値に戻る", () => {
    const index = indexOf([A, B, C], "B", true);
    const result = decodeMapIndex(encodeMapIndex(index));
    expect(result).toEqual({ kind: "ok", index, repaired: false });
  });

  it("encode は整形しない JSON を返す", () => {
    expect(encodeMapIndex(indexOf([A], "A"))).toBe(
      JSON.stringify(indexOf([A], "A")),
    );
  });

  it("id が不正・文字列でない項目と name が文字列でない項目を除外する", () => {
    const result = decodeMapIndex(
      raw({
        version: 1,
        currentMapId: "A",
        maps: [
          A,
          { ...B, id: "bad id" },
          { ...B, id: 5 },
          { ...B, name: 5 },
          null,
          "x",
        ],
        legacyCleanupPending: false,
      }),
    );
    expect(result).toEqual({
      kind: "ok",
      index: indexOf([A], "A"),
      repaired: true,
    });
  });

  it("配列・数値の項目も、オブジェクトでない項目として除外する", () => {
    const result = decodeMapIndex(
      raw({
        version: 1,
        currentMapId: "A",
        maps: [[B.id, B.name], A, 1, true],
        legacyCleanupPending: false,
      }),
    );
    expect(result).toEqual({
      kind: "ok",
      index: indexOf([A], "A"),
      repaired: true,
    });
  });

  it("空の name は既定の名前にする", () => {
    const result = decodeMapIndex(
      raw({ ...indexOf([{ ...A, name: "" }], "A") }),
    );
    expect(result).toMatchObject({
      kind: "ok",
      repaired: true,
      index: { maps: [{ id: "A", name: "無題のマップ" }] },
    });
  });

  it("60コードポイントの name は先頭50コードポイントにする", () => {
    const result = decodeMapIndex(
      raw(indexOf([{ ...A, name: "あ".repeat(60) }], "A")),
    );
    expect(result).toMatchObject({
      kind: "ok",
      repaired: true,
      index: { maps: [{ name: "あ".repeat(50) }] },
    });
  });

  it("日時が読めない項目は UNKNOWN_MAP_TIMESTAMP にする", () => {
    const result = decodeMapIndex(
      raw(indexOf([{ ...A, createdAt: "x", updatedAt: "2026" }], "A")),
    );
    expect(result).toMatchObject({
      kind: "ok",
      repaired: true,
      index: {
        maps: [
          {
            createdAt: UNKNOWN_MAP_TIMESTAMP,
            updatedAt: UNKNOWN_MAP_TIMESTAMP,
          },
        ],
      },
    });
  });

  it("日時が欠けている項目も UNKNOWN_MAP_TIMESTAMP にする", () => {
    const result = decodeMapIndex(
      raw({
        version: 1,
        currentMapId: "A",
        maps: [{ id: "A", name: "x" }],
        legacyCleanupPending: false,
      }),
    );
    expect(result).toMatchObject({
      kind: "ok",
      repaired: true,
      index: {
        maps: [
          {
            createdAt: UNKNOWN_MAP_TIMESTAMP,
            updatedAt: UNKNOWN_MAP_TIMESTAMP,
          },
        ],
      },
    });
  });

  it("id が重複したら最初の項目だけ残す", () => {
    const result = decodeMapIndex(
      raw({
        ...indexOf([], "a"),
        maps: [
          { ...A, id: "a", name: "1" },
          { ...B, id: "a", name: "2" },
        ],
      }),
    );
    expect(result).toMatchObject({
      kind: "ok",
      repaired: true,
      index: { maps: [{ id: "a", name: "1" }] },
    });
  });

  it.each([
    ["一覧に無い", "Z"],
    ["数値", 5],
  ])(
    "currentMapId が%sとき、配列の先頭ではなく表示順の先頭にする",
    (_label, currentMapId) => {
      // 配列の先頭 A は最も古く、最新の更新日時は B。
      const result = decodeMapIndex(
        raw({ ...indexOf([A, B, C], "A"), currentMapId }),
      );
      expect(result).toMatchObject({
        kind: "ok",
        repaired: true,
        index: { currentMapId: "B" },
      });
    },
  );

  it("legacyCleanupPending が真偽値でなければ false にして repaired にする", () => {
    const result = decodeMapIndex(
      raw({ ...indexOf([A], "A"), legacyCleanupPending: "yes" }),
    );
    expect(result).toEqual({
      kind: "ok",
      index: indexOf([A], "A", false),
      repaired: true,
    });
  });

  it("legacyCleanupPending: true はそのまま保つ", () => {
    const result = decodeMapIndex(raw(indexOf([A], "A", true)));
    expect(result).toEqual({
      kind: "ok",
      index: indexOf([A], "A", true),
      repaired: false,
    });
  });
});

describe("表示順", () => {
  it("更新日時の新しい順に並べる", () => {
    expect(sortMapEntriesForDisplay([A, B, C]).map((e) => e.id)).toEqual([
      "B",
      "C",
      "A",
    ]);
  });

  it("更新日時が同じなら作成日時の新しい順", () => {
    const older = entry(
      "x",
      "2026-10-21T10:00:00.000Z",
      "2026-10-01T00:00:00.000Z",
    );
    const newer = entry(
      "y",
      "2026-10-21T10:00:00.000Z",
      "2026-10-02T00:00:00.000Z",
    );
    expect(sortMapEntriesForDisplay([older, newer]).map((e) => e.id)).toEqual([
      "y",
      "x",
    ]);
  });

  it("両方同じなら id の昇順", () => {
    const b = entry("b", "2026-10-21T10:00:00.000Z");
    const a = entry("a", "2026-10-21T10:00:00.000Z");
    expect(sortMapEntriesForDisplay([b, a]).map((e) => e.id)).toEqual([
      "a",
      "b",
    ]);
    expect(compareMapEntriesForDisplay(a, b)).toBeLessThan(0);
  });

  it("UNKNOWN_MAP_TIMESTAMP の項目は最後にする", () => {
    const unknown = entry("u", UNKNOWN_MAP_TIMESTAMP, UNKNOWN_MAP_TIMESTAMP);
    expect(sortMapEntriesForDisplay([unknown, A, B]).map((e) => e.id)).toEqual([
      "B",
      "A",
      "u",
    ]);
  });

  it("入力の配列を変えない", () => {
    const maps = Object.freeze([A, B, C]);
    expect(() => sortMapEntriesForDisplay(maps)).not.toThrow();
    expect(maps.map((e) => e.id)).toEqual(["A", "B", "C"]);
  });
});

describe("削除後に開くマップ", () => {
  it("selectNextMapAfterRemoval は removedId を除いた表示順の先頭を返す", () => {
    expect(selectNextMapAfterRemoval(indexOf([A, B, C], "B"), "B")).toEqual(C);
    expect(selectNextMapAfterRemoval(indexOf([A, B, C], "B"), "A")).toEqual(B);
  });

  it("1件だけなら null", () => {
    expect(selectNextMapAfterRemoval(indexOf([A], "A"), "A")).toBeNull();
  });

  it("describeMapRemoval: 開いているマップを消すと次のマップが決まる", () => {
    expect(describeMapRemoval([A, B, C], "B", "B")).toEqual({
      target: B,
      isCurrent: true,
      isLast: false,
      nextMap: C,
    });
  });

  it("describeMapRemoval: 開いていないマップを消すと nextMap は null", () => {
    expect(describeMapRemoval([A, B, C], "B", "A")).toEqual({
      target: A,
      isCurrent: false,
      isLast: false,
      nextMap: null,
    });
  });

  it("describeMapRemoval: 1件だけのとき", () => {
    expect(describeMapRemoval([A], "A", "A")).toEqual({
      target: A,
      isCurrent: true,
      isLast: true,
      nextMap: null,
    });
  });

  it("describeMapRemoval: 存在しない id は null", () => {
    expect(describeMapRemoval([A, B], "A", "Z")).toBeNull();
  });

  it("配列の順と表示順が異なっても、確認の文言と実際の削除で開くマップが一致する", () => {
    const maps = [A, B, C, entry("D", "2026-10-21T09:00:00.000Z")];
    for (const current of ["A", "B", "C", "D"]) {
      const index = indexOf(maps, current);
      for (const id of ["A", "B", "C", "D"]) {
        const preview = describeMapRemoval(
          sortMapEntriesForDisplay(index.maps),
          index.currentMapId,
          id,
        );
        const removed = removeMapEntry(index, id);
        if (id === current) {
          expect(preview?.nextMap?.id).toBe(removed?.currentMapId);
        } else {
          expect(preview?.nextMap).toBeNull();
          expect(removed?.currentMapId).toBe(current);
        }
      }
    }
  });
});

describe("removeMapEntry", () => {
  it("開いていない項目の削除で現在の id は変わらない", () => {
    const result = removeMapEntry(indexOf([A, B, C], "B"), "A");
    expect(result).toEqual(indexOf([B, C], "B"));
  });

  it("開いている項目の削除で次のマップが現在になる", () => {
    const result = removeMapEntry(indexOf([A, B, C], "B"), "B");
    expect(result).toEqual(indexOf([A, C], "C"));
  });

  it("1件だけなら null", () => {
    expect(removeMapEntry(indexOf([A], "A"), "A")).toBeNull();
  });

  it("存在しない id は null", () => {
    expect(removeMapEntry(indexOf([A, B], "A"), "Z")).toBeNull();
  });

  it("入力のオブジェクトを変えない", () => {
    const index = Object.freeze({
      ...indexOf([A, B, C], "B"),
      maps: Object.freeze([A, B, C]) as MapIndexEntry[],
    });
    expect(() => removeMapEntry(index, "B")).not.toThrow();
    expect(index.maps).toHaveLength(3);
    expect(index.currentMapId).toBe("B");
  });
});

describe("replaceLastMapEntry", () => {
  it("1件の index を新しい項目へ置き換え、現在の id も新しい id にする", () => {
    const replacement = entry("N", "2026-10-22T00:00:00.000Z");
    expect(
      replaceLastMapEntry(indexOf([A], "A", true), "A", replacement),
    ).toEqual(indexOf([replacement], "N", true));
  });

  it("2件以上なら null", () => {
    expect(
      replaceLastMapEntry(indexOf([A, B], "A"), "A", entry("N", A.updatedAt)),
    ).toBeNull();
  });

  it("removedId が残っている1件と違えば null", () => {
    expect(
      replaceLastMapEntry(indexOf([A], "A"), "Z", entry("N", A.updatedAt)),
    ).toBeNull();
  });
});

describe("更新の関数", () => {
  it("addMapEntry は末尾へ追加して現在の id にする", () => {
    const added = entry("N", "2026-10-22T00:00:00.000Z");
    expect(addMapEntry(indexOf([A, B], "A"), added)).toEqual(
      indexOf([A, B, added], "N"),
    );
  });

  it("setCurrentMap は存在しない id で null", () => {
    expect(setCurrentMap(indexOf([A, B], "A"), "B")?.currentMapId).toBe("B");
    expect(setCurrentMap(indexOf([A, B], "A"), "Z")).toBeNull();
  });

  it("renameMapEntry は名前だけを変え、updatedAt を変えない", () => {
    const result = renameMapEntry(indexOf([A, B], "A"), "B", "新しい名前");
    expect(result?.maps[1]).toEqual({ ...B, name: "新しい名前" });
    expect(result?.maps[0]).toEqual(A);
    expect(renameMapEntry(indexOf([A, B], "A"), "Z", "x")).toBeNull();
  });

  it("touchMapEntry は対象の updatedAt だけを変える", () => {
    const result = touchMapEntry(
      indexOf([A, B], "A"),
      "B",
      "2026-10-22T00:00:00.000Z",
    );
    expect(result?.maps[1]).toEqual({
      ...B,
      updatedAt: "2026-10-22T00:00:00.000Z",
    });
    expect(result?.maps[0]).toEqual(A);
    expect(touchMapEntry(indexOf([A], "A"), "Z", A.updatedAt)).toBeNull();
  });

  it("withLegacyCleanupPending は印だけを変える", () => {
    expect(withLegacyCleanupPending(indexOf([A], "A"), true)).toEqual(
      indexOf([A], "A", true),
    );
  });

  it("findMapEntry は2番目以降の項目も id で探す", () => {
    expect(findMapEntry(indexOf([A, B, C], "A"), "C")).toEqual(C);
    expect(findMapEntry(indexOf([A, B, C], "A"), "Z")).toBeNull();
  });

  it("入力のオブジェクトを変えない", () => {
    const index = Object.freeze({
      ...indexOf([A, B], "A"),
      maps: Object.freeze([A, B]) as MapIndexEntry[],
    });
    expect(() => {
      addMapEntry(index, entry("N", A.updatedAt));
      setCurrentMap(index, "B");
      renameMapEntry(index, "B", "x");
      touchMapEntry(index, "B", A.updatedAt);
      withLegacyCleanupPending(index, true);
    }).not.toThrow();
  });
});

describe("項目の作成", () => {
  it("createMapIndexEntry は作成日時と更新日時を同じにする", () => {
    expect(
      createMapIndexEntry("a", "名前", "2026-10-21T00:00:00.000Z"),
    ).toEqual({
      id: "a",
      name: "名前",
      createdAt: "2026-10-21T00:00:00.000Z",
      updatedAt: "2026-10-21T00:00:00.000Z",
    });
  });

  it("createSingleMapIndex は1件の index を作る", () => {
    expect(createSingleMapIndex(A, true)).toEqual(indexOf([A], "A", true));
  });
});

describe("pickUnusedMapId", () => {
  function sequence(ids: string[]): () => string {
    let i = 0;
    return () => ids[Math.min(i++, ids.length - 1)];
  }

  it("使用済みの id を飛ばして未使用の id を返す", () => {
    expect(pickUnusedMapId(sequence(["a", "a", "b"]), (id) => id === "a")).toBe(
      "b",
    );
  });

  it("正規表現に合わない id は作り直す", () => {
    expect(pickUnusedMapId(sequence(["bad id", "ok"]), () => false)).toBe("ok");
  });

  it("10回すべて使用済みなら null", () => {
    const generate = jest.fn(() => "a");
    expect(pickUnusedMapId(generate, () => true)).toBeNull();
    expect(generate).toHaveBeenCalledTimes(10);
  });

  it("試行回数を指定できる", () => {
    const generate = jest.fn(() => "a");
    expect(pickUnusedMapId(generate, () => true, 3)).toBeNull();
    expect(generate).toHaveBeenCalledTimes(3);
  });
});
