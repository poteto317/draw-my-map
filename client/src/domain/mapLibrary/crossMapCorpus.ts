import { sortMapEntriesForDisplay, type MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import type { Node } from "@/types/node";

export type ReadableMapSnapshot = {
  readonly mapId: string;
  readonly mapName: string;
  readonly isCurrent: boolean;
  readonly nodes: readonly Node[];
};

export type UnreadableMapInfo = {
  readonly mapId: string;
  readonly mapName: string;
  readonly reason: "read-error" | "corrupt";
};

export type OtherMapsCorpus = {
  readonly readableMaps: readonly ReadableMapSnapshot[];
  readonly unreadableMaps: readonly UnreadableMapInfo[];
};

export type CrossMapCorpus = {
  readonly readableMaps: readonly ReadableMapSnapshot[];
  readonly unreadableMaps: readonly UnreadableMapInfo[];
};

export type ComposeCrossMapCorpusInput = {
  readonly otherMapsCorpus: OtherMapsCorpus;
  readonly currentMapId: string;
  readonly currentMapName: string;
  readonly currentNodes: readonly Node[];
};

// 呼び出しごとに新しいオブジェクトと配列参照を返す（L-461）
export function createEmptyOtherMapsCorpus(): OtherMapsCorpus {
  return {
    readableMaps: [],
    unreadableMaps: [],
  };
}

// 他マップのコーパス（readOtherMapsCorpus の結果）を読み直すべきかを決めるキー。現在マップ以外の項目を表示順に並べ、
// 内容に影響する id・name・updatedAt（本体が置き換わると変わる）だけで作る。現在マップの項目は含めないので、
// 自動保存で現在マップの updatedAt が変わっても（表示順の先頭へ移っても）キーは変わらない
export function otherMapsCorpusKey(maps: readonly MapIndexEntry[], currentMapId: string): string {
  const others = sortMapEntriesForDisplay(maps).filter((entry) => entry.id !== currentMapId);
  return JSON.stringify([currentMapId, others.map((entry) => [entry.id, entry.name, entry.updatedAt])]);
}

// 現在マップを先頭に置き、後ろに他マップを連結した横断コーパスを組み立てる
export function composeCrossMapCorpus(
  input: ComposeCrossMapCorpusInput,
): CrossMapCorpus {
  const { otherMapsCorpus, currentMapId, currentMapName, currentNodes } = input;
  const currentSnapshot: ReadableMapSnapshot = {
    mapId: currentMapId,
    mapName: currentMapName,
    isCurrent: true,
    nodes: currentNodes,
  };

  return {
    readableMaps: [
      currentSnapshot,
      ...otherMapsCorpus.readableMaps.filter(
        (snapshot) => snapshot.mapId !== currentMapId,
      ),
    ],
    unreadableMaps: otherMapsCorpus.unreadableMaps.filter(
      (info) => info.mapId !== currentMapId,
    ),
  };
}
