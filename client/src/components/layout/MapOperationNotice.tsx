import type { OperationNotice } from "@/types/operationNotice";

type MapOperationNoticeProps = {
  notice: OperationNotice | null;
};

const noticeClassNames: Record<OperationNotice["kind"], string> = {
  status: "text-zinc-600 dark:text-zinc-400",
  warning: "text-amber-700 dark:text-amber-300",
  error: "text-red-700 dark:text-red-300",
};

export function MapOperationNotice({ notice }: MapOperationNoticeProps) {
  if (notice === null) return null;

  const isStatus = notice.kind === "status";
  return (
    <p
      role={isStatus ? "status" : "alert"}
      aria-live={isStatus ? "polite" : "assertive"}
      className={`text-sm ${noticeClassNames[notice.kind]}`}
    >
      {notice.message}
    </p>
  );
}
