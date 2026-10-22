import type {
  MapBodyWriteResult,
  MapFlushResult,
  MapStorageSession,
} from "@/types/mapStorageSession";

type WriteOutcome = MapBodyWriteResult["status"];

type CreateTestStorageSessionOptions = {
  mapId?: string;
  initialJson?: string | null;
  readError?: string;
};

export type TestStorageSession = {
  session: MapStorageSession;
  // 実際に書けた内容の履歴。failed・inactive の書き込みは積まない
  writes: string[];
  setWriteOutcome: (outcome: WriteOutcome) => void;
  registeredFlushCount: () => number;
  // 最後に登録した flush を呼ぶ。登録が無ければ unchanged
  callRegisteredFlush: () => MapFlushResult;
};

const TEST_WRITE_ERROR = "テスト用の保存失敗";

// フックのテスト用の偽セッション。failed・inactive のときは本物と同じく書かない
export function createTestStorageSession(
  options: CreateTestStorageSessionOptions = {},
): TestStorageSession {
  const { mapId = "test-map", initialJson = null, readError } = options;
  const writes: string[] = [];
  let writeOutcome: WriteOutcome = "saved";
  const flushes = new Set<() => MapFlushResult>();

  const session: MapStorageSession = {
    mapId,
    readBody: () => (readError === undefined
      ? { ok: true, value: initialJson }
      : { ok: false, error: readError }),
    writeBody: (json) => {
      if (writeOutcome === "failed") {
        return { status: "failed", error: TEST_WRITE_ERROR };
      }
      if (writeOutcome === "inactive") return { status: "inactive" };
      writes.push(json);
      return { status: "saved" };
    },
    registerFlush: (flush) => {
      // 同じ関数を二重に登録しても解除で両方消えないよう、登録ごとに包む
      const registered = () => flush();
      flushes.add(registered);
      return () => {
        flushes.delete(registered);
      };
    },
  };

  return {
    session,
    writes,
    setWriteOutcome: (outcome: WriteOutcome) => {
      writeOutcome = outcome;
    },
    registeredFlushCount: () => flushes.size,
    callRegisteredFlush: () => {
      const latest = [...flushes].at(-1);
      return latest === undefined ? { status: "unchanged" } : latest();
    },
  };
}
