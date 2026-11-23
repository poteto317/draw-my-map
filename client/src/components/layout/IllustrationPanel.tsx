"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";
import { IllustrationImage } from "@/components/layout/IllustrationImage";
import { getIllustrationPanelView } from "@/components/layout/illustrationPanelView";
import {
  defaultReadImageFile,
  prepareIllustrationUpload,
} from "@/services/illustration/prepareIllustrationUpload";
import { createIllustrationThumbnail } from "@/services/illustration/illustrationThumbnail";
import type { IllustrationGenerationState } from "@/types/illustrationGeneration";
import type { Node } from "@/types/node";

const ILLUSTRATION_OVERWRITE_CONFIRM_MESSAGE =
  "設定済みのイラストを置き換えますか？";

function defaultConfirmOverwrite(): boolean {
  return window.confirm(ILLUSTRATION_OVERWRITE_CONFIRM_MESSAGE);
}

const UPLOAD_ERROR_MESSAGE =
  "画像を添付できませんでした。ファイルが大きすぎるか、形式が対応していません。";

const actionButtonClassName =
  "rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700";

type IllustrationPanelProps = {
  selectedNode: Pick<Node, "id" | "label" | "illustration"> | null;
  generation: IllustrationGenerationState;
  onGenerate: (nodeId: number) => void;
  onAttach: (nodeId: number, dataUrl: string) => void;
  onRemove: (nodeId: number) => void;
  /** locked・保護モード・主選択≠1 等。添付・生成・削除を無効化する */
  disabled?: boolean;
  confirmOverwrite?: () => boolean;
  createThumbnail?: (dataUrl: string) => Promise<string>;
  readImageFile?: (file: File) => Promise<string>;
};

export function IllustrationPanel({
  selectedNode,
  generation,
  onGenerate,
  onAttach,
  onRemove,
  disabled = false,
  confirmOverwrite = defaultConfirmOverwrite,
  createThumbnail = createIllustrationThumbnail,
  readImageFile = defaultReadImageFile,
}: IllustrationPanelProps) {
  const view = getIllustrationPanelView(selectedNode, generation);
  const preview = view.image?.kind === "preview" ? view.image : null;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const actionsDisabled = selectedNode === null || disabled || view.isGenerating || isUploading;
  const errorMessage = uploadError ?? view.errorMessage;

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || selectedNode === null || disabled) {
      input.value = "";
      return;
    }

    // 上書き確認は UI 対話。サービス層（読取・サムネイル・検証）の前に済ませる
    if (selectedNode.illustration !== undefined && !confirmOverwrite()) {
      input.value = "";
      return;
    }

    setUploadError(null);
    setIsUploading(true);
    try {
      const prepared = await prepareIllustrationUpload(file, {
        readImageFile,
        createThumbnail,
      });
      if (!prepared.ok) {
        setUploadError(UPLOAD_ERROR_MESSAGE);
        return;
      }
      onAttach(selectedNode.id, prepared.dataUrl);
    } finally {
      setIsUploading(false);
      input.value = "";
    }
  };

  return (
    <section aria-label="イラスト" className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">イラスト</h2>
      {selectedNode === null ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">ノードを選択してください</p>
      ) : (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">対象ノード</span>
          <p
            className="line-clamp-3 break-words text-sm text-zinc-800 dark:text-zinc-100"
            title={selectedNode.label || undefined}
          >
            {getNodeDisplayLabel(selectedNode.label)}
          </p>
        </div>
      )}
      {view.status === "generating" && (
        <p role="status" className="text-sm text-zinc-500 dark:text-zinc-400">生成中です</p>
      )}
      {selectedNode !== null && preview !== null && (
        <>
          <IllustrationImage
            src={preview.dataUrl}
            alt={`${getNodeDisplayLabel(selectedNode.label)}のイラスト`}
          />
          <button
            type="button"
            disabled={actionsDisabled}
            onClick={() => onAttach(selectedNode.id, preview.dataUrl)}
            className="rounded-md border border-blue-600 px-3 py-2 text-sm text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-zinc-700"
          >
            ノードに設定
          </button>
        </>
      )}
      {selectedNode !== null && view.image?.kind === "attached" && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">設定済みのイラスト</span>
          <IllustrationImage
            src={view.image.dataUrl}
            alt={`${getNodeDisplayLabel(selectedNode.label)}の設定済みイラスト`}
          />
        </div>
      )}
      {selectedNode !== null && view.canRemove && (
        <button
          type="button"
          disabled={actionsDisabled}
          onClick={() => onRemove(selectedNode.id)}
          className="rounded-md border border-red-600 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-400 dark:text-red-400 dark:hover:bg-zinc-700"
        >
          設定済みのイラストを削除
        </button>
      )}
      {errorMessage !== null && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      )}
      <button
        type="button"
        disabled={actionsDisabled}
        onClick={() => fileInputRef.current?.click()}
        className={actionButtonClassName}
      >
        画像を添付
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={actionsDisabled}
        onChange={handleFileChange}
      />
      <button
        type="button"
        disabled={actionsDisabled}
        onClick={() => {
          if (selectedNode !== null) onGenerate(selectedNode.id);
        }}
        className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-500"
      >
        {view.isGenerating ? "生成中…" : view.generateLabel}
      </button>
    </section>
  );
}
