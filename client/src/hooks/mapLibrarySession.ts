import {
  findMapEntry,
  touchMapEntry,
  type MapIndexV1,
} from "@/domain/mapLibrary/mapIndex";
import {
  readMapBody,
  writeMapBody,
  writeMapIndex,
  type MapLibraryStorage,
} from "@/services/persistence/mapLibraryStorage";
import type { MapFlushResult, MapStorageSession } from "@/types/mapStorageSession";

// useMapLibrary が通常のモードのマップごとに渡す保存のセッション。
// セッション番号で古いエディタからの保存と flush の登録を拒み、保存のたびに更新日時を進める

export type FlushRegistration = { session: number; flush: () => MapFlushResult };

export type PersistentMapSessionContext = {
  storage: MapLibraryStorage;
  mapId: string;
  // このセッションを作ったときのセッション番号。writeBody・registerFlush が閉じ込める
  sessionNumber: number;
  // 呼ばれた時点のセッション番号の正本
  getActiveSessionNumber: () => number;
  // 呼ばれた時点の通常のモードのインデックス。通常のモードでなければ null
  getActiveIndex: () => MapIndexV1 | null;
  now: () => Date;
  // 更新日時を進めたインデックスを書けたときに、状態へ反映する
  commitIndex: (index: MapIndexV1) => void;
  // 現在のセッションの flush の登録先。1つだけ持つ
  flushSlot: { current: FlushRegistration | null };
};

export function createPersistentMapSession(
  context: PersistentMapSessionContext,
): MapStorageSession {
  const { storage, mapId, sessionNumber, flushSlot } = context;
  return {
    mapId,
    readBody: () => readMapBody(storage, mapId),
    writeBody: (json) => {
      const index = context.getActiveIndex();
      // セッション番号で照合する。マップ id だけでは A → B → A を区別できない（L-571、L-103）
      if (
        sessionNumber !== context.getActiveSessionNumber()
        || index === null
        || findMapEntry(index, mapId) === null
      ) {
        return { status: "inactive" };
      }
      const written = writeMapBody(storage, mapId, json);
      if (!written.ok) return { status: "failed", error: written.error };
      // 更新日時の書き込みに失敗しても本体は保存済み。次の保存で書き直す
      const touched = touchMapEntry(index, mapId, context.now().toISOString());
      if (touched !== null && writeMapIndex(storage, touched).ok) {
        context.commitIndex(touched);
      }
      return { status: "saved" };
    },
    registerFlush: (flush) => {
      // 古いセッションの登録で、現在のセッションの登録を上書きしない
      if (sessionNumber !== context.getActiveSessionNumber()) {
        return () => {};
      }
      const registration: FlushRegistration = { session: sessionNumber, flush };
      flushSlot.current = registration;
      return () => {
        if (flushSlot.current === registration) flushSlot.current = null;
      };
    },
  };
}

// 現在のセッション番号で登録された flush だけを呼ぶ。登録が無ければ unchanged
export function flushRegisteredSession(
  registration: FlushRegistration | null,
  activeSessionNumber: number,
): MapFlushResult {
  if (registration === null || registration.session !== activeSessionNumber) {
    return { status: "unchanged" };
  }
  return registration.flush();
}
