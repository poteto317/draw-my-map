import type { ExportScope } from "@/domain/exportScope/exportScope";

export type ExportFormat =
  | "png"
  | "svg"
  | "print"
  | "markdown"
  | "json"
  | "bullets"
  | "opml"
  | "csv"
  | "tsv";

export type ExportFormatControl = {
  readonly enabled: boolean;
  readonly disabledReason: string | undefined;
};

export type ExportFormatControls = Record<ExportFormat, ExportFormatControl>;

const EXPORT_FORMATS = [
  "png",
  "svg",
  "print",
  "markdown",
  "json",
  "bullets",
  "opml",
  "csv",
  "tsv",
] as const satisfies readonly ExportFormat[];

// OPML/CSV/TSV はスコープ別の利用可否セットに常に含める（空集合の無効化は exportNodeCount で一括判定）。
const EXCHANGE_FORMATS_ALWAYS_ENABLED: readonly ExportFormat[] = ["opml", "csv", "tsv"];

const ENABLED_FORMATS: Record<ExportScope, ReadonlySet<ExportFormat>> = {
  all: new Set([
    "png",
    "svg",
    "print",
    "markdown",
    "json",
    "bullets",
    ...EXCHANGE_FORMATS_ALWAYS_ENABLED,
  ]),
  visible: new Set([
    "png",
    "svg",
    "print",
    "markdown",
    ...EXCHANGE_FORMATS_ALWAYS_ENABLED,
  ]),
  selection: new Set([
    "png",
    "markdown",
    "json",
    ...EXCHANGE_FORMATS_ALWAYS_ENABLED,
  ]),
};

const EMPTY_EXPORT_REASON = "書き出すノードがありません";
const FORMAT_UNAVAILABLE_REASON = "この書き出し対象では使えません";

export function isExportFormatEnabled(scope: ExportScope, format: ExportFormat): boolean {
  return ENABLED_FORMATS[scope].has(format);
}

export function canUseSelectionScope(selectionTargetIds: readonly number[]): boolean {
  return selectionTargetIds.length === 1;
}

// スコープ×形式の可否と無効理由を一度に決める（UI 側で形式ごとに同じ判定を繰り返さない）
// exportNodeCount は exchange 書き出しの closed 集合長と空判定で一致する（closed ⊇ resolved）。
export function resolveExportFormatControls(
  scope: ExportScope,
  exportNodeCount: number,
): ExportFormatControls {
  const emptyBlocksExport = scope !== "all" && exportNodeCount === 0;
  const controls = {} as ExportFormatControls;
  for (const format of EXPORT_FORMATS) {
    const formatEnabled = isExportFormatEnabled(scope, format);
    controls[format] = {
      enabled: formatEnabled && !emptyBlocksExport,
      disabledReason: !formatEnabled
        ? FORMAT_UNAVAILABLE_REASON
        : emptyBlocksExport
          ? EMPTY_EXPORT_REASON
          : undefined,
    };
  }
  return controls;
}
