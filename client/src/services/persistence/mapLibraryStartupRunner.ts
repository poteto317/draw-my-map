import type { MapIndexV1 } from "@/domain/mapLibrary/mapIndex";
import {
  planMapLibraryStartup,
  type MapLibraryStartupDeps,
  type ProtectedStartup,
} from "@/domain/mapLibrary/mapLibraryStartup";
import { DEFAULT_MAP_NAME } from "@/domain/mapLibrary/mapName";
import type { OperationNotice } from "@/types/operationNotice";
import {
  readMapLibrarySnapshot,
  removeLegacyMap,
  writeCorruptIndexBackup,
  writeMapIndex,
  writeMigratedMap,
  type MapLibraryStorage,
} from "./mapLibraryStorage";

export type MapLibraryStartupResult =
  | { mode: "persistent"; index: MapIndexV1; notice: OperationNotice | null }
  | {
      mode: "protected";
      mapId: string;
      mapName: string;
      initialJson: string | null;
      notice: OperationNotice;
    };

function toPersistent(
  index: MapIndexV1,
  notice: OperationNotice | null,
): MapLibraryStartupResult {
  return { mode: "persistent", index, notice };
}

function toProtected(protectedStartup: ProtectedStartup): MapLibraryStartupResult {
  return {
    mode: "protected",
    mapId: protectedStartup.mapId,
    mapName: DEFAULT_MAP_NAME,
    initialJson: protectedStartup.initialJson,
    notice: protectedStartup.notice,
  };
}

// 分岐の判定は planMapLibraryStartup に任せ、ここでは計画どおりに書き、
// 各書き込みが成功したときだけ次へ進む。storage が null なら書き込みは失敗として扱う。
export function runMapLibraryStartup(
  storage: MapLibraryStorage | null,
  deps: MapLibraryStartupDeps,
): MapLibraryStartupResult {
  const plan = planMapLibraryStartup(readMapLibrarySnapshot(storage), deps);
  switch (plan.kind) {
    case "protected":
      return toProtected(plan.protectedStartup);
    case "open":
      return toPersistent(plan.index, null);
    case "cleanupLegacy": {
      // 旧キーを消せたときだけ P: false を書く。どちらかが失敗したら元のインデックスのまま。
      const cleaned =
        storage !== null &&
        removeLegacyMap(storage).ok &&
        writeMapIndex(storage, plan.cleanedIndex).ok;
      return toPersistent(cleaned ? plan.cleanedIndex : plan.index, null);
    }
    case "initialize": {
      const written = storage !== null && writeMapIndex(storage, plan.index).ok;
      return written
        ? toPersistent(plan.index, plan.notice)
        : toProtected(plan.onFailure);
    }
    case "migrate": {
      if (storage === null) {
        return toProtected(plan.onFailure);
      }
      // 失敗時の本体の戻しと、容量不足のときのやり直し・旧キーの書き戻しは writeMigratedMap が行う。
      // 戻しの成否にかかわらず保護モード。旧キーを書き戻せなかったときだけ、通知で JSON の書き出しを促す。
      const migrated = writeMigratedMap(storage, {
        bodyId: plan.bodyId,
        bodyJson: plan.bodyJson,
        index: plan.index,
        retryIndex: plan.retryIndex,
        legacyRaw: plan.legacyRaw,
      });
      if (migrated.ok) {
        // やり直しで成功したときは旧キーがもう無いので、P: false のインデックスで開く。
        return toPersistent(
          migrated.legacy === "removed" ? plan.retryIndex : plan.index,
          null,
        );
      }
      const legacyLost =
        migrated.failedStep === "retry" && migrated.legacy === "lost";
      return toProtected(legacyLost ? plan.onLegacyLost : plan.onFailure);
    }
    case "rebuild": {
      // 退避に失敗したらインデックスを書かず、壊れたインデックスを残す。
      const rebuilt =
        storage !== null &&
        writeCorruptIndexBackup(storage, plan.corruptRaw).ok &&
        writeMapIndex(storage, plan.index).ok;
      return rebuilt
        ? toPersistent(plan.index, plan.notice)
        : toProtected(plan.onFailure);
    }
  }
}
