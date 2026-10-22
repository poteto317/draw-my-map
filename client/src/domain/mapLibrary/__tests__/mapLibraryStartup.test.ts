import {
  planMapLibraryStartup,
  type MapLibraryStartupDeps,
  type MapLibraryStartupPlan,
  type MapLibraryStartupSnapshot,
} from "../mapLibraryStartup";
import { encodeMapIndex, type MapIndexV1 } from "../mapIndex";
import { serializeMapDocument } from "@/domain/persistence/mapDocumentCodec";
import { createTestNode } from "@/testing/createTestNode";
import { createJpegDataUrl } from "@/testing/jpegFixture";

const NOW = "2026-10-21T03:04:05.000Z";

const UNAVAILABLE_WARNING =
  "ブラウザの保存領域を使えないため、このマップは保存されません。必要な場合はJSONで書き出してください。";
const INITIALIZE_FAILURE =
  "ブラウザに保存できないため、このマップは保存されません。必要な場合はJSONで書き出してください。";
const MIGRATE_FAILURE =
  "以前の保存データを新しい形式へ移行できませんでした。この画面での変更は保存されません。必要な場合はJSONで書き出してください。";
const MIGRATE_LEGACY_LOST_FAILURE =
  "以前の保存データを新しい形式へ移行できず、ブラウザにも残せませんでした。この画面での変更は保存されません。ページを閉じる前に、JSONで書き出してください。";
const LEGACY_CORRUPT_WARNING =
  "以前の保存データを読み込めなかったため、空のマップで開始します。以前の保存データは消さずに残しています。";
const LEGACY_CORRUPT_FAILURE =
  "以前の保存データを読み込めず、ブラウザにも保存できないため、このマップは保存されません。以前の保存データは消さずに残しています。";
const REBUILD_WARNING =
  "マップの一覧を読み取れなかったため、保存済みのマップから一覧を作り直しました。マップ名は「復元したマップ」になっています。";
const REBUILD_EMPTY_WARNING =
  "マップの一覧を読み取れなかったため、空のマップで開始します。";
const REBUILD_FAILURE =
  "マップの一覧を読み取れませんでした。保存データを守るため、この画面での変更は保存されません。";

// 渡した id を順に返し、尽きたら最後の id を返し続ける。
function createDeps(ids: readonly string[]): MapLibraryStartupDeps {
  let position = 0;
  return {
    now: () => new Date(NOW),
    generateId: () => {
      const id = ids[Math.min(position, ids.length - 1)];
      position += 1;
      return id;
    },
  };
}

function available(
  overrides: Partial<{
    indexRaw: string | null;
    legacyRaw: string | null;
    bodyIds: readonly string[];
  }> = {},
): MapLibraryStartupSnapshot {
  return {
    kind: "available",
    indexRaw: null,
    legacyRaw: null,
    bodyIds: [],
    ...overrides,
  };
}

function storedIndex(legacyCleanupPending: boolean): MapIndexV1 {
  return {
    version: 1,
    currentMapId: "b",
    maps: [
      {
        id: "a",
        name: "旅行の計画",
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-02T00:00:00.000Z",
      },
      {
        id: "b",
        name: "読書メモ",
        createdAt: "2026-10-03T00:00:00.000Z",
        updatedAt: "2026-10-04T00:00:00.000Z",
      },
    ],
    legacyCleanupPending,
  };
}

const legacyNodes = [
  createTestNode({ id: 7, parentId: null, x: 120, y: -40, label: "中心" }),
  createTestNode({
    id: 12,
    parentId: 7,
    x: 360,
    y: 80,
    // イラスト付きノードの高さは読み込み時に補正されるため、補正後の値にしておく。
    height: 116,
    label: "イラスト付き",
    importance: "high",
    illustration: createJpegDataUrl(2, 3),
  }),
];

const legacyV3Raw = JSON.stringify({
  version: 3,
  layoutMode: "manual",
  nodes: legacyNodes,
});

const legacyV1Raw = JSON.stringify({
  version: 1,
  layoutMode: "auto",
  nodes: [
    { id: 3, parentId: null, x: 10, y: 20, width: 160, height: 64, label: "旧形式" },
  ],
});

// 計画の中に旧キーを書く・消す指示が無いことを、計画が持つキーで確かめる。
// migrate の legacyRaw・retryIndex・onLegacyLost は、本体かインデックスの書き込みが容量不足のときだけ
// writeMigratedMap が行うやり直し（旧キーを消して書き直し、失敗したら書き戻す）に使う値で、指示ではない。
function expectNoLegacyWrite(plan: MapLibraryStartupPlan) {
  const keys = Object.keys(plan).sort();
  const allowed: Record<MapLibraryStartupPlan["kind"], string[]> = {
    protected: ["kind", "protectedStartup"],
    open: ["index", "kind"],
    cleanupLegacy: ["cleanedIndex", "index", "kind"],
    initialize: ["index", "kind", "notice", "onFailure"],
    migrate: [
      "bodyId",
      "bodyJson",
      "index",
      "kind",
      "legacyRaw",
      "onFailure",
      "onLegacyLost",
      "retryIndex",
    ],
    rebuild: ["corruptRaw", "index", "kind", "notice", "onFailure"],
  };
  expect(keys).toEqual(allowed[plan.kind]);
}

describe("planMapLibraryStartup", () => {
  it("保存領域を使えないときは保護モードで空のマップを開き、warning を出す", () => {
    const plan = planMapLibraryStartup({ kind: "unavailable" }, createDeps(["p1"]));

    expect(plan).toEqual({
      kind: "protected",
      protectedStartup: {
        mapId: "p1",
        initialJson: null,
        notice: { kind: "warning", message: UNAVAILABLE_WARNING },
      },
    });
  });

  it("正常なインデックスで後始末が不要なら、旧キーがあっても書き込まずに開く", () => {
    const index = storedIndex(false);
    const plan = planMapLibraryStartup(
      available({
        indexRaw: encodeMapIndex(index),
        legacyRaw: legacyV3Raw,
        bodyIds: ["a", "b"],
      }),
      createDeps(["new"]),
    );

    expect(plan).toEqual({ kind: "open", index });
  });

  it("正常なインデックスで後始末が必要なら、P を false にしたインデックスを用意する", () => {
    const index = storedIndex(true);
    const plan = planMapLibraryStartup(
      available({ indexRaw: encodeMapIndex(index), legacyRaw: legacyV3Raw }),
      createDeps(["new"]),
    );

    expect(plan).toEqual({
      kind: "cleanupLegacy",
      index,
      cleanedIndex: { ...index, legacyCleanupPending: false },
    });
    if (plan.kind !== "cleanupLegacy") throw new Error("unreachable");
    expect(plan.cleanedIndex.legacyCleanupPending).toBe(false);
  });

  it("補正したインデックスは書き込みの計画を作らずに開く", () => {
    const raw = JSON.stringify({
      version: 1,
      currentMapId: "missing",
      maps: [
        { id: "a", name: "  旅行  ", createdAt: "壊れた日時", updatedAt: NOW },
        { id: "a", name: "重複", createdAt: NOW, updatedAt: NOW },
      ],
      legacyCleanupPending: false,
    });

    const plan = planMapLibraryStartup(available({ indexRaw: raw }), createDeps(["new"]));

    expect(plan).toEqual({
      kind: "open",
      index: {
        version: 1,
        currentMapId: "a",
        maps: [
          { id: "a", name: "旅行", createdAt: "1970-01-01T00:00:00.000Z", updatedAt: NOW },
        ],
        legacyCleanupPending: false,
      },
    });
  });

  it("インデックスも旧キーも無ければ、無題のマップ1件で初回起動する", () => {
    const plan = planMapLibraryStartup(available(), createDeps(["first", "p1"]));

    expect(plan).toEqual({
      kind: "initialize",
      index: {
        version: 1,
        currentMapId: "first",
        maps: [{ id: "first", name: "無題のマップ", createdAt: NOW, updatedAt: NOW }],
        legacyCleanupPending: false,
      },
      notice: null,
      onFailure: {
        mapId: "p1",
        initialJson: null,
        notice: { kind: "error", message: INITIALIZE_FAILURE },
      },
    });
  });

  it("旧キーが V3 で読めれば、中身をそのまま引き継いで移行する", () => {
    const plan = planMapLibraryStartup(
      available({ legacyRaw: legacyV3Raw }),
      createDeps(["migrated", "p1"]),
    );

    expect(plan).toEqual({
      kind: "migrate",
      bodyId: "migrated",
      bodyJson: serializeMapDocument({
        version: 3,
        layoutMode: "manual",
        nodes: legacyNodes,
      }),
      index: {
        version: 1,
        currentMapId: "migrated",
        maps: [{ id: "migrated", name: "無題のマップ", createdAt: NOW, updatedAt: NOW }],
        legacyCleanupPending: true,
      },
      retryIndex: {
        version: 1,
        currentMapId: "migrated",
        maps: [{ id: "migrated", name: "無題のマップ", createdAt: NOW, updatedAt: NOW }],
        legacyCleanupPending: false,
      },
      legacyRaw: legacyV3Raw,
      onFailure: {
        mapId: "p1",
        initialJson: legacyV3Raw,
        notice: { kind: "error", message: MIGRATE_FAILURE },
      },
      onLegacyLost: {
        mapId: "p1",
        initialJson: legacyV3Raw,
        notice: { kind: "error", message: MIGRATE_LEGACY_LOST_FAILURE },
      },
    });
    if (plan.kind !== "migrate") throw new Error("unreachable");
    // ノードの id・座標・イラストを作り直していないこと（L-456）。
    expect(JSON.parse(plan.bodyJson).nodes).toEqual(legacyNodes);
    expect(plan.index.maps[0].createdAt).toBe(plan.index.maps[0].updatedAt);
  });

  it("旧キーが V1 なら V3 へ正規化して移行する", () => {
    const plan = planMapLibraryStartup(
      available({ legacyRaw: legacyV1Raw }),
      createDeps(["migrated"]),
    );

    if (plan.kind !== "migrate") throw new Error(`migrate ではありません: ${plan.kind}`);
    expect(plan.bodyJson).toContain('"version": 3');
    expect(JSON.parse(plan.bodyJson)).toEqual({
      version: 3,
      layoutMode: "auto",
      nodes: [
        {
          id: 3,
          parentId: null,
          x: 10,
          y: 20,
          width: 160,
          height: 64,
          label: "旧形式",
          importance: "medium",
        },
      ],
    });
    expect(plan.onFailure.initialJson).toBe(legacyV1Raw);
  });

  it("旧キーが壊れていれば、旧キーに触れずに空のマップで始め、warning を出す", () => {
    const plan = planMapLibraryStartup(
      available({ legacyRaw: "{" }),
      createDeps(["first", "p1"]),
    );

    expect(plan).toEqual({
      kind: "initialize",
      index: {
        version: 1,
        currentMapId: "first",
        maps: [{ id: "first", name: "無題のマップ", createdAt: NOW, updatedAt: NOW }],
        legacyCleanupPending: false,
      },
      notice: { kind: "warning", message: LEGACY_CORRUPT_WARNING },
      onFailure: {
        mapId: "p1",
        initialJson: null,
        notice: { kind: "error", message: LEGACY_CORRUPT_FAILURE },
      },
    });
    expectNoLegacyWrite(plan);
  });

  it("インデックスが壊れていれば、残っている本体から id 昇順で一覧を作り直す", () => {
    const corruptRaw = '{"version":1,"maps":[';
    const plan = planMapLibraryStartup(
      available({
        indexRaw: corruptRaw,
        legacyRaw: legacyV3Raw,
        bodyIds: ["b", "bad id", "a", "x".repeat(65)],
      }),
      createDeps(["p1"]),
    );

    expect(plan).toEqual({
      kind: "rebuild",
      corruptRaw,
      index: {
        version: 1,
        currentMapId: "a",
        maps: [
          { id: "a", name: "復元したマップ 1", createdAt: NOW, updatedAt: NOW },
          { id: "b", name: "復元したマップ 2", createdAt: NOW, updatedAt: NOW },
        ],
        legacyCleanupPending: false,
      },
      notice: { kind: "warning", message: REBUILD_WARNING },
      onFailure: {
        mapId: "p1",
        initialJson: null,
        notice: { kind: "error", message: REBUILD_FAILURE },
      },
    });
    expectNoLegacyWrite(plan);
  });

  it("decodeMapIndex が corrupt と判定する形（maps が空）も作り直しになる", () => {
    const corruptRaw = JSON.stringify({
      version: 1,
      currentMapId: "a",
      maps: [],
      legacyCleanupPending: false,
    });
    const plan = planMapLibraryStartup(
      available({ indexRaw: corruptRaw, bodyIds: ["a"] }),
      createDeps(["p1"]),
    );

    expect(plan.kind).toBe("rebuild");
  });

  it.each([
    ["読める", legacyV3Raw],
    ["無い", null],
    ["壊れている", "{"],
  ])(
    "インデックスが壊れていて本体が0件なら、旧キーが%sときも移行せずに空のマップで作り直す",
    (_label, legacyRaw) => {
      const plan = planMapLibraryStartup(
        available({ indexRaw: "{", legacyRaw, bodyIds: [] }),
        createDeps(["fresh", "p1"]),
      );

      expect(plan).toEqual({
        kind: "rebuild",
        corruptRaw: "{",
        index: {
          version: 1,
          currentMapId: "fresh",
          maps: [{ id: "fresh", name: "無題のマップ", createdAt: NOW, updatedAt: NOW }],
          legacyCleanupPending: false,
        },
        notice: { kind: "warning", message: REBUILD_EMPTY_WARNING },
        onFailure: {
          mapId: "p1",
          initialJson: null,
          notice: { kind: "error", message: REBUILD_FAILURE },
        },
      });
      expectNoLegacyWrite(plan);
    },
  );

  it("移行の計画にも旧キーの書き込み・削除が含まれない", () => {
    const plan = planMapLibraryStartup(
      available({ legacyRaw: legacyV3Raw }),
      createDeps(["migrated"]),
    );

    expectNoLegacyWrite(plan);
  });

  it("生成した id が孤立した本体と一致したら、作り直した id で初回起動する", () => {
    const plan = planMapLibraryStartup(
      available({ bodyIds: ["orphan"] }),
      createDeps(["orphan", "new"]),
    );

    if (plan.kind !== "initialize") throw new Error(`initialize ではありません: ${plan.kind}`);
    expect(plan.index.currentMapId).toBe("new");
    expect(plan.index.maps.map((map) => map.id)).toEqual(["new"]);
  });

  it("生成した id が孤立した本体と一致したら、作り直した id で移行する", () => {
    const plan = planMapLibraryStartup(
      available({ legacyRaw: legacyV3Raw, bodyIds: ["orphan"] }),
      createDeps(["orphan", "new"]),
    );

    if (plan.kind !== "migrate") throw new Error(`migrate ではありません: ${plan.kind}`);
    expect(plan.bodyId).toBe("new");
    expect(plan.index.currentMapId).toBe("new");
  });

  it.each([
    ["初回起動", null, null, INITIALIZE_FAILURE, null],
    ["移行", null, legacyV3Raw, MIGRATE_FAILURE, legacyV3Raw],
    ["旧キーが壊れている起動", null, "{", LEGACY_CORRUPT_FAILURE, null],
  ])(
    "%sで生成した id が10回とも孤立した本体と一致したら、その分岐の失敗と同じ保護モードになる",
    (_label, indexRaw, legacyRaw, message, initialJson) => {
      const plan = planMapLibraryStartup(
        available({ indexRaw, legacyRaw, bodyIds: ["orphan"] }),
        createDeps(["orphan"]),
      );

      expect(plan).toEqual({
        kind: "protected",
        protectedStartup: {
          mapId: "orphan",
          initialJson,
          notice: { kind: "error", message },
        },
      });
    },
  );

  it("本体0件の作り直しで正しい id を10回とも作れなければ、作り直しの失敗と同じ保護モードになる", () => {
    const plan = planMapLibraryStartup(
      available({ indexRaw: "{", bodyIds: [] }),
      createDeps(["bad id"]),
    );

    expect(plan).toEqual({
      kind: "protected",
      protectedStartup: {
        mapId: "bad id",
        initialJson: null,
        notice: { kind: "error", message: REBUILD_FAILURE },
      },
    });
  });

  it.each<[string, MapLibraryStartupSnapshot]>([
    ["保存領域なし", { kind: "unavailable" }],
    ["正常なインデックス", available({ indexRaw: encodeMapIndex(storedIndex(true)) })],
    ["初回起動", available()],
    ["移行", available({ legacyRaw: legacyV3Raw })],
    ["旧キーの破損", available({ legacyRaw: "{" })],
    ["インデックスの破損", available({ indexRaw: "{", bodyIds: ["b", "a"] })],
  ])("同じ入力と決定的な deps なら同じ計画を返す（%s）", (_label, snapshot) => {
    const first = planMapLibraryStartup(snapshot, createDeps(["x1", "x2", "x3"]));
    const second = planMapLibraryStartup(snapshot, createDeps(["x1", "x2", "x3"]));

    expect(second).toEqual(first);
  });
});
