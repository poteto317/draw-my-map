"use client";

import { useCallback, useMemo, useState } from "react";
import {
  composeCrossMapCorpus,
  createEmptyOtherMapsCorpus,
  otherMapsCorpusKey,
  type CrossMapCorpus,
} from "@/domain/mapLibrary/crossMapCorpus";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import {
  getMapUserMeta,
  isMapArchived,
  type MapLibraryMetaV1,
} from "@/domain/mapLibrary/mapLibraryMetaModel";
import { readOtherMapsCorpus } from "@/services/persistence/mapLibraryCorpusReader";
import type { MapLibraryStorage } from "@/services/persistence/mapLibraryStorage";
import type { Node } from "@/types/node";

export type UseCrossMapCorpusOptions = {
  readonly maps: readonly MapIndexEntry[];
  readonly currentMapId: string;
  readonly currentMapName: string;
  readonly currentNodes: readonly Node[];
  readonly storage: MapLibraryStorage;
  readonly storageMode: "persistent" | "protected";
  readonly libraryMeta: MapLibraryMetaV1;
};

export type UseCrossMapCorpusResult = {
  readonly corpus: CrossMapCorpus;
  readonly refreshCorpus: () => void;
};

// 他マップのスナップショットをキャッシュし、現在マップの編集・自動保存では再読込せず合成だけを軽量に行う。
// 他マップの増減・名前や更新日時の変化・現在マップの切り替え・refreshCorpus() では読み直す。
// 保護モード時はストレージを読まず空の他マップコーパスを返す（L-002）。
export function useCrossMapCorpus({
  maps,
  currentMapId,
  currentMapName,
  currentNodes,
  storage,
  storageMode,
  libraryMeta,
}: UseCrossMapCorpusOptions): UseCrossMapCorpusResult {
  const [corpusRefreshKey, setCorpusRefreshKey] = useState(0);

  const refreshCorpus = useCallback(() => {
    setCorpusRefreshKey((key) => key + 1);
  }, []);

  // 自動保存のたびにインデックス（現在マップの updatedAt）が変わり maps が新しい配列になるので、maps そのものではなく
  // 他マップの内容に影響する項目のキーが変わったときだけ、読み込みに使う maps を差し替える（描画中の state 更新で揃える）
  const mapsKey = otherMapsCorpusKey(maps, currentMapId);
  const [mapsSnapshot, setMapsSnapshot] = useState({ key: mapsKey, maps });
  if (mapsSnapshot.key !== mapsKey) {
    setMapsSnapshot({ key: mapsKey, maps });
  }
  const corpusMaps = mapsSnapshot.key === mapsKey ? mapsSnapshot.maps : maps;

  const mapArchiveKey = useMemo(
    () => JSON.stringify(
      corpusMaps.map((entry) => [
        entry.id,
        isMapArchived(getMapUserMeta(libraryMeta, entry.id)),
      ]),
    ),
    [corpusMaps, libraryMeta.mapMeta],
  );

  const otherMapsCorpus = useMemo(() => {
    if (storageMode === "protected" || corpusRefreshKey < 0) {
      return createEmptyOtherMapsCorpus();
    }
    return readOtherMapsCorpus({
      maps: corpusMaps,
      currentMapId,
      storage,
    });
  }, [corpusMaps, currentMapId, storage, storageMode, corpusRefreshKey]);

  const corpus = useMemo(
    () =>
      composeCrossMapCorpus({
        otherMapsCorpus,
        currentMapId,
        currentMapName,
        currentNodes,
        libraryMeta,
      }),
    [otherMapsCorpus, currentMapId, currentMapName, currentNodes, mapArchiveKey],
  );

  return { corpus, refreshCorpus };
}
