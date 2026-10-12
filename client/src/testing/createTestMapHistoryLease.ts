import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";

// 履歴グループを検証しないテストで、onBeginNodeMove の戻り値として使う常に有効なlease
export function createTestMapHistoryLease(): MapHistoryGroupLease {
  return { isActive: () => true, finish: () => {} };
}

// 履歴グループの開始・終了回数を検証するためのspy。expireで以後のisActiveをfalseにする
export function createMapHistoryLeaseSpy() {
  let active = true;
  const lease = {
    isActive: jest.fn(() => active),
    finish: jest.fn(),
  };
  const onBeginNodeMove = jest.fn((): MapHistoryGroupLease => lease);
  return {
    lease,
    onBeginNodeMove,
    expire: () => {
      active = false;
    },
  };
}
