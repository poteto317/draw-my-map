/**
 * 共同編集中のアウトライン／画像エクスポート拒否を FormatControls に写す。
 * MapEditor から業務ルール適用を切り離す。
 */
export type ExportFormatControlSlot = {
  enabled: boolean;
  disabledReason?: string;
};

export type ExportFormatControlsLike = {
  markdown: ExportFormatControlSlot;
  bullets: ExportFormatControlSlot;
  opml: ExportFormatControlSlot;
  csv: ExportFormatControlSlot;
  tsv: ExportFormatControlSlot;
  json: ExportFormatControlSlot;
  png: ExportFormatControlSlot;
  svg: ExportFormatControlSlot;
  print: ExportFormatControlSlot;
};

export function applyCollabOutlineExportBlock<T extends ExportFormatControlsLike>(
  controls: T,
  blockedReason: string | null,
): T {
  if (blockedReason === null) return controls;
  const disabled = { enabled: false as const, disabledReason: blockedReason };
  return {
    ...controls,
    markdown: disabled,
    bullets: disabled,
    opml: disabled,
    csv: disabled,
    tsv: disabled,
    json: disabled,
    png: disabled,
    svg: disabled,
    print: disabled,
  };
}
