import { MapOperationNotice } from "@/components/layout/MapOperationNotice";
import type { OperationNotice } from "@/types/operationNotice";

// ヘッダーの操作通知バーに出す通知の並び。配列の位置が系統を表し、null はその系統の通知が無いことを表す

type MapOperationNoticeListProps = {
  notices: readonly (OperationNotice | null)[];
};

// 通知が1つも無ければ、ヘッダーに通知行を確保しないよう呼び出し側が null を渡す
export function hasOperationNotice(notices: readonly (OperationNotice | null)[]): boolean {
  return notices.some((notice) => notice !== null);
}

export function MapOperationNoticeList({ notices }: MapOperationNoticeListProps) {
  return (
    <>
      {notices.map((notice, slot) => (
        // 系統ごとの位置は固定なので、位置を key にして、ほかの系統の通知の増減で要素を作り直さない
        <MapOperationNotice key={slot} notice={notice} />
      ))}
    </>
  );
}
