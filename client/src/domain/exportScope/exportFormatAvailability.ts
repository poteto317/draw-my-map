import type { ExportScope } from "@/domain/exportScope/exportScope";

export type ExportFormat = "png" | "svg" | "markdown" | "json" | "bullets";

export type ExportFormatControl = {
  readonly enabled: boolean;
  readonly disabledReason: string | undefined;
};

export type ExportFormatControls = Record<ExportFormat, ExportFormatControl>;

const EXPORT_FORMATS = ["png", "svg", "markdown", "json", "bullets"] as const satisfies readonly ExportFormat[];

const ENABLED_FORMATS: Record<ExportScope, ReadonlySet<ExportFormat>> = {
  all: new Set(["png", "svg", "markdown", "json", "bullets"]),
  visible: new Set(["png", "svg", "markdown"]),
  selection: new Set(["png", "markdown", "json"]),
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
