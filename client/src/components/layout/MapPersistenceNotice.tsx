import type { PersistenceNotice } from "@/types/persistence";

type MapPersistenceNoticeProps = {
  notice: PersistenceNotice | null;
};

const noticeClassNames: Record<PersistenceNotice["kind"], string> = {
  status: "text-zinc-600 dark:text-zinc-400",
  warning: "text-amber-700 dark:text-amber-300",
  error: "text-red-700 dark:text-red-300",
};

export function MapPersistenceNotice({ notice }: MapPersistenceNoticeProps) {
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
