"use client";

import { useReannouncedNotice } from "@/components/layout/useReannouncedNotice";
import type { OperationNotice, ShellNotice } from "@/types/operationNotice";

export type { ShellNotice };

type MapLibraryNoticeRegionProps = {
  notice: ShellNotice | null;
};

const noticeClassNames: Record<OperationNotice["kind"], string> = {
  status: "text-zinc-600 dark:text-zinc-400",
  warning: "text-amber-700 dark:text-amber-300",
  error: "text-red-700 dark:text-red-300",
};

// 常設のライブリージョン。sequenceが変わるたびに一度空にし、次のフレームで文言を入れて再通知させる
export function MapLibraryNoticeRegion({ notice }: MapLibraryNoticeRegionProps) {
  const shown = useReannouncedNotice(notice?.sequence ?? null, notice?.notice ?? null);

  const className = `text-sm ${shown ? noticeClassNames[shown.kind] : ""}`;
  const isStatus = shown?.kind === "status";
  return (
    <div data-testid="map-library-notices" className="w-full px-6">
      <p role="status" aria-live="polite" className={className}>
        {isStatus ? shown.message : ""}
      </p>
      <p role="alert" aria-live="assertive" className={className}>
        {shown !== null && !isStatus ? shown.message : ""}
      </p>
    </div>
  );
}
