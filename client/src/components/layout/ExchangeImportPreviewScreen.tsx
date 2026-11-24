import { useId, type KeyboardEvent, type MouseEvent, type Ref } from "react";
import { OutlinePreviewTree } from "@/components/layout/OutlinePreviewTree";
import type { OutlineParentCandidate } from "@/components/layout/OutlineImportPreviewScreen";
import {
  EXCHANGE_OPML_LOSSY_NOTICE,
  EXCHANGE_ROOT_TARGET_LABEL,
  formatExchangePreviewSummary,
} from "@/domain/exchange/exchangeMessages";
import type { ParsedExchange } from "@/domain/exchange/parseExchangeContent";
import { formatOutlinePreviewTruncation } from "@/domain/outline/outlineMessages";
import type { OutlinePreview } from "@/domain/outline/outlinePreview";
import type { OutlineImportTarget } from "@/domain/nodes/resolveForestImportInsertionTarget";

type ExchangeImportPreviewScreenProps = {
  headingId: string;
  summaryId: string;
  warningsId: string;
  parsed: ParsedExchange;
  preview: OutlinePreview;
  parentCandidate: OutlineParentCandidate;
  target: OutlineImportTarget;
  onTargetChange: (target: OutlineImportTarget) => void;
  onSubmit: () => void;
  onBack: () => void;
  regionRef: Ref<HTMLDivElement>;
};

const buttonClassName =
  "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-700 dark:text-zinc-200";

const radioClassName =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

function handleSubmitKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
  if ((event.key === "Enter" || event.key === " ") && event.repeat) {
    event.preventDefault();
  }
}

function childTargetLabel(
  parentCandidate: Exclude<OutlineParentCandidate, { kind: "none" }>,
): string {
  switch (parentCandidate.kind) {
    case "found":
      return `選択中のノード「${parentCandidate.label}」の子として追加`;
    case "missing":
      return "選択していたノードの子として追加";
    default: {
      const unreachable: never = parentCandidate;
      throw new Error(
        `Unknown outline parent candidate: ${JSON.stringify(unreachable)}`,
      );
    }
  }
}

export function ExchangeImportPreviewScreen({
  headingId,
  summaryId,
  warningsId,
  parsed,
  preview,
  parentCandidate,
  target,
  onTargetChange,
  onSubmit,
  onBack,
  regionRef,
}: ExchangeImportPreviewScreenProps) {
  const radioName = useId();
  const truncation = formatOutlinePreviewTruncation(preview);

  const handleSubmitClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail > 1) return;
    onSubmit();
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 id={headingId} className="text-base font-semibold">
        変換結果の確認
      </h2>
      <p id={summaryId} className="text-sm">
        {formatExchangePreviewSummary(parsed.items)}
      </p>
      <ul
        id={warningsId}
        className="flex flex-col gap-1 text-sm break-words text-amber-800 [overflow-wrap:anywhere] dark:text-amber-300"
      >
        {parsed.showOpmlLossyNotice && (
          <li>注意: {EXCHANGE_OPML_LOSSY_NOTICE}</li>
        )}
        {parsed.warnings.map((warning) => (
          <li key={warning}>注意: {warning}</li>
        ))}
      </ul>
      <div
        ref={regionRef}
        role="region"
        aria-label="変換結果のプレビュー"
        tabIndex={0}
        className="max-h-[40vh] overflow-auto rounded-md border border-zinc-200 p-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-700"
      >
        <OutlinePreviewTree roots={preview.roots} />
      </div>
      {truncation !== null && <p className="text-sm">{truncation}</p>}
      {parentCandidate.kind === "none" ? (
        <p className="text-sm">新しいルートとして追加します。</p>
      ) : (
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="mb-1 font-medium">追加する位置</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={radioName}
              className={radioClassName}
              checked={target === "root"}
              onChange={() => onTargetChange("root")}
            />
            {EXCHANGE_ROOT_TARGET_LABEL}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={radioName}
              className={radioClassName}
              checked={target === "child"}
              onChange={() => onTargetChange("child")}
              disabled={parentCandidate.kind === "missing"}
            />
            {childTargetLabel(parentCandidate)}
          </label>
        </fieldset>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className={buttonClassName} onClick={onBack}>
          戻る
        </button>
        <button
          type="button"
          className={buttonClassName}
          onClick={handleSubmitClick}
          onKeyDown={handleSubmitKeyDown}
        >
          マップに追加
        </button>
      </div>
    </div>
  );
}