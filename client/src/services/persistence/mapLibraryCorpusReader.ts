import type {
  OtherMapsCorpus,
  ReadableMapSnapshot,
  UnreadableMapInfo,
} from "@/domain/mapLibrary/crossMapCorpus";
import {
  sortMapEntriesForDisplay,
  type MapIndexEntry,
} from "@/domain/mapLibrary/mapIndex";
import { parseMapDocumentJson } from "@/domain/persistence/mapDocumentDecoder";
import {
  readMapBody,
  type MapLibraryStorage,
} from "@/services/persistence/mapLibraryStorage";

export type ReadOtherMapsCorpusInput = {
  readonly maps: readonly MapIndexEntry[];
  readonly currentMapId: string;
  readonly storage: MapLibraryStorage;
};

// 現在マップ以外のマップを表示順で読み込み、読取成功分と失敗分（read-error / corrupt）に分けて返す
export function readOtherMapsCorpus(
  input: ReadOtherMapsCorpusInput,
): OtherMapsCorpus {
  const { maps, currentMapId, storage } = input;
  const readableMaps: ReadableMapSnapshot[] = [];
  const unreadableMaps: UnreadableMapInfo[] = [];

  for (const entry of sortMapEntriesForDisplay(maps)) {
    if (entry.id === currentMapId) continue;

    const body = readMapBody(storage, entry.id);
    if (!body.ok) {
      unreadableMaps.push({
        mapId: entry.id,
        mapName: entry.name,
        reason: "read-error",
      });
      continue;
    }

    // 本体未保存（null）は未編集の新規空マップとして正常に扱う
    if (body.value === null) {
      readableMaps.push({
        mapId: entry.id,
        mapName: entry.name,
        isCurrent: false,
        nodes: [],
      });
      continue;
    }

    const parsed = parseMapDocumentJson(body.value);
    if (!parsed.ok) {
      unreadableMaps.push({
        mapId: entry.id,
        mapName: entry.name,
        reason: "corrupt",
      });
      continue;
    }

    readableMaps.push({
      mapId: entry.id,
      mapName: entry.name,
      isCurrent: false,
      nodes: parsed.value.nodes,
    });
  }

  return { readableMaps, unreadableMaps };
}
