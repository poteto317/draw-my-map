import { createEmptyMapLibraryMeta } from "@/domain/mapLibrary/mapLibraryMeta";
import type { MapLibraryView } from "@/hooks/mapLibraryState";
import {
  isPendingNavigationReadyToConsume,
  isPendingNavigationStale,
} from "@/hooks/pendingMapNavigationState";
import { createTestStorageSession } from "@/testing/createTestStorageSession";
import type { PendingMapNodeNavigation } from "@/types/pendingMapNavigation";

function createReadyView(
  mapId: string,
  sessionNumber: number,
  storageMode: "persistent" | "protected" = "persistent",
): MapLibraryView {
  const entry = {
    id: mapId,
    name: `マップ ${mapId}`,
    createdAt: "2026-11-19T00:00:00.000Z",
    updatedAt: "2026-11-19T00:00:00.000Z",
  };
  return {
    status: "ready",
    storageMode,
    maps: [entry],
    currentMap: entry,
    storageSession: createTestStorageSession({ mapId, sessionNumber }).session,
    startupNotice: null,
    trashEntries: [],
    trashStatus: "ok",
    libraryMeta: createEmptyMapLibraryMeta(),
    libraryMetaStatus: "ready",
  };
}

const pending: PendingMapNodeNavigation = {
  mapId: "map-b",
  sessionNumber: 2,
  nodeId: 10,
  token: 1,
};

describe("isPendingNavigationStale", () => {
  it("保留中の要求が無ければ古くない", () => {
    expect(isPendingNavigationStale(null, createReadyView("map-a", 1))).toBe(false);
  });

  it("現在のマップとセッションが一致する永続モードなら古くない", () => {
    expect(isPendingNavigationStale(pending, createReadyView("map-b", 2))).toBe(false);
  });

  it("現在のマップが違えば古い", () => {
    expect(isPendingNavigationStale(pending, createReadyView("map-a", 2))).toBe(true);
  });

  it("セッション番号が違えば古い", () => {
    expect(isPendingNavigationStale(pending, createReadyView("map-b", 3))).toBe(true);
  });

  it("保護モードへ移ったら古い", () => {
    expect(isPendingNavigationStale(pending, createReadyView("map-b", 2, "protected"))).toBe(true);
  });

  it("ライブラリが ready でなければ古い", () => {
    expect(isPendingNavigationStale(pending, { status: "loading" } as MapLibraryView)).toBe(true);
  });
});

describe("isPendingNavigationReadyToConsume", () => {
  const editor = { mapId: "map-b", sessionNumber: 2, hydrated: true };

  it("対象マップ・セッションが一致し、復元が済んでいれば消費できる", () => {
    expect(isPendingNavigationReadyToConsume(pending, editor)).toBe(true);
  });

  it("保留中の要求が無ければ消費しない", () => {
    expect(isPendingNavigationReadyToConsume(null, editor)).toBe(false);
  });

  it("対象マップが違えば消費しない", () => {
    expect(isPendingNavigationReadyToConsume(pending, { ...editor, mapId: "map-a" })).toBe(false);
  });

  it("セッション番号が違えば消費しない", () => {
    expect(isPendingNavigationReadyToConsume(pending, { ...editor, sessionNumber: 1 })).toBe(false);
  });

  it("復元が済んでいなければ消費しない", () => {
    expect(isPendingNavigationReadyToConsume(pending, { ...editor, hydrated: false })).toBe(false);
  });
});
