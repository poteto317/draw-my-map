"use client";

import { useState } from "react";
import { formatOutlineRows, type OutlineExportFormat } from "@/domain/outline/outlineExport";
import type { OutlineRows } from "@/domain/outline/outlineRows";
import { downloadOutlineText } from "@/services/outlineExport/outlineTextDownload";
import type { OperationNotice } from "@/types/operationNotice";

type UseOutlineExportOptions = {
  model: OutlineRows;
  mapName: string;
  downloadText?: (text: string, mapName: string, format: OutlineExportFormat) => void;
};

type UseOutlineExportResult = {
  exportMarkdown: () => void;
  exportPlainText: () => void;
  notice: OperationNotice | null;
};

export function useOutlineExport({ model, mapName, downloadText = downloadOutlineText }: UseOutlineExportOptions): UseOutlineExportResult {
  const [notice, setNotice] = useState<OperationNotice | null>(null);

  function exportFormat(format: OutlineExportFormat) {
    const fileKind = format === "md" ? "Markdown" : "箇条書き";
    try {
      const result = formatOutlineRows(model, format);
      if (!result.ok) {
        switch (result.reason) {
          case "empty":
            setNotice({ kind: "warning", message: "書き出すノードがありません。" });
            return;
          case "too-large":
            setNotice({ kind: "warning", message: "書き出すテキストが大きすぎます。JSONで書き出してください。" });
            return;
          case "invalid-structure":
            setNotice({ kind: "error", message: `${fileKind}ファイルを書き出せませんでした。` });
            return;
        }
      }
      downloadText(result.text, mapName, format);
      setNotice({ kind: "status", message: `${fileKind}ファイルを書き出しました。` });
    } catch {
      setNotice({ kind: "error", message: `${fileKind}ファイルを書き出せませんでした。` });
    }
  }

  return {
    exportMarkdown: () => exportFormat("md"),
    exportPlainText: () => exportFormat("txt"),
    notice,
  };
}
