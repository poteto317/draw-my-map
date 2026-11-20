"use client";

import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { resolveNodeMapLinkDraftTargets } from "@/components/layout/nodeMapLinkDraftTargets";
import type { CrossMapCorpus } from "@/domain/mapLibrary/crossMapCorpus";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import {
  resolveNodeMapLink,
  type BrokenMapLinkStatus,
  type ResolvedNodeMapLink,
} from "@/domain/mapLibrary/mapLinkGraph";
import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";
import {
  NODE_MAP_LINKS_MAX_COUNT,
  formatNodeMapLinkFailure,
  nodeMapLinkKey,
  parsePositiveNodeIdString,
  type AddNodeMapLinkOutcome,
  type NodeMapLink,
  type NodeMapLinkFailureReason,
} from "@/domain/nodes/nodeMapLink";

export type NodeMapLinksSectionProps = {
  selectedNode: { readonly id: number; readonly mapLinks?: readonly NodeMapLink[] } | null;
  documentRevision: number;
  currentMapId: string;
  maps: readonly MapIndexEntry[];
  corpus: CrossMapCorpus;
  storageMode: "persistent" | "protected";
  onAddMapLink: (
    nodeId: number,
    input: { targetMapId: string; targetNodeId?: number },
  ) => AddNodeMapLinkOutcome;
  onRemoveMapLink: (nodeId: number, target: NodeMapLink) => boolean;
  onNavigateToMapTarget: (targetMapId: string, targetNodeId?: number) => void;
};

const NO_MAP_LINKS: readonly NodeMapLink[] = [];

const buttonClassName =
  "shrink-0 rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600";

const selectClassName =
  "min-w-0 w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";

function formatTargetNodeSuffix(targetNodeId: number | undefined): string {
  return targetNodeId === undefined ? "" : ` / ノード ${targetNodeId}`;
}

function describeLinkTarget(resolved: ResolvedNodeMapLink): string {
  switch (resolved.status) {
    case "valid":
      return resolved.targetNodeLabel !== undefined
        ? `${resolved.targetMapName} / ${resolved.targetNodeLabel}`
        : resolved.targetMapName;
    case "missing-node":
    case "unreadable-map":
      return `${resolved.targetMapName}${formatTargetNodeSuffix(resolved.link.targetNodeId)}`;
    case "missing-map":
    case "protected-unavailable":
      return `${resolved.link.targetMapId}${formatTargetNodeSuffix(resolved.link.targetNodeId)}`;
    default: {
      const unreachable: never = resolved;
      return unreachable;
    }
  }
}

function brokenReasonText(status: BrokenMapLinkStatus): string {
  switch (status) {
    case "missing-map":
      return "対象マップが見つかりません";
    case "missing-node":
      return "対象ノードが見つかりません";
    case "unreadable-map":
      return "対象マップを読み取れません";
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

type NodeMapLinkItemProps = {
  link: NodeMapLink;
  resolved: ResolvedNodeMapLink;
  onNavigate: (targetMapId: string, targetNodeId?: number) => void;
  onRemove: (target: NodeMapLink) => void;
};

function NodeMapLinkItem({
  link,
  resolved,
  onNavigate,
  onRemove,
}: NodeMapLinkItemProps) {
  const targetDescription = describeLinkTarget(resolved);

  return (
    <li className="flex items-start gap-2">
      {resolved.status === "valid" ? (
        <button
          type="button"
          onClick={() => onNavigate(link.targetMapId, link.targetNodeId)}
          title={targetDescription}
          className="min-w-0 flex-1 truncate rounded-md py-1 text-left text-sm text-blue-700 underline hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-blue-300 dark:hover:text-blue-200"
        >
          {targetDescription}
        </button>
      ) : resolved.status === "protected-unavailable" ? (
        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
          <span className="text-xs font-medium text-amber-800 dark:text-amber-200">
            保護モードのため他マップのリンク先を確認・移動できません
          </span>
          <span
            className="truncate text-xs text-zinc-500 dark:text-zinc-400"
            title={targetDescription}
          >
            {targetDescription}
          </span>
        </div>
      ) : (
        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950/60 dark:text-red-200">
              リンク切れ
            </span>
            <span
              className="min-w-0 truncate text-xs text-zinc-600 dark:text-zinc-300"
              title={targetDescription}
            >
              {targetDescription}
            </span>
          </div>
          <span className="text-xs text-red-700 dark:text-red-300">
            {brokenReasonText(resolved.status)}
          </span>
        </div>
      )}
      <button
        type="button"
        aria-label={`マップ間リンクを削除: ${targetDescription}`}
        className={buttonClassName}
        onClick={() => onRemove(link)}
      >
        削除
      </button>
    </li>
  );
}

// 右パネルの「マップ間リンク」節。documentRevision では作り直さず、レンダー中に下書きとエラーだけをリセットしてフォーカスを守る（L-397）
export function NodeMapLinksSection({
  selectedNode,
  documentRevision,
  currentMapId,
  maps,
  corpus,
  storageMode,
  onAddMapLink,
  onRemoveMapLink,
  onNavigateToMapTarget,
}: NodeMapLinksSectionProps) {
  const headingId = useId();
  const mapSelectId = useId();
  const nodeSelectId = useId();
  const countId = useId();
  const errorId = useId();
  const mapSelectRef = useRef<HTMLSelectElement>(null);

  const defaultMapId = maps[0]?.id ?? "";
  const selectedNodeId = selectedNode?.id ?? null;

  const [draftTargetMapId, setDraftTargetMapId] = useState(defaultMapId);
  const [draftTargetNodeId, setDraftTargetNodeId] = useState("");
  const [errorReason, setErrorReason] = useState<NodeMapLinkFailureReason | null>(null);
  const [seenRevision, setSeenRevision] = useState(documentRevision);
  const [seenNodeId, setSeenNodeId] = useState<number | null>(selectedNodeId);

  // 文書世代や選択ノードが変わったら、古い下書きとエラーだけを引き継がずにリセットする（L-397）
  const isContextChanged = documentRevision !== seenRevision || selectedNodeId !== seenNodeId;
  if (isContextChanged) {
    setSeenRevision(documentRevision);
    setSeenNodeId(selectedNodeId);
    setDraftTargetMapId(defaultMapId);
    setDraftTargetNodeId("");
    setErrorReason(null);
  }

  const mapLinks = selectedNode?.mapLinks ?? NO_MAP_LINKS;
  const isAtLimit = mapLinks.length >= NODE_MAP_LINKS_MAX_COUNT;

  const {
    targetMapId: effectiveTargetMapId,
    targetNodeId: effectiveTargetNodeId,
    isTargetMapUnreadable: isSelectedMapUnreadable,
    selectableNodes,
  } = resolveNodeMapLinkDraftTargets({
    maps,
    corpus,
    currentMapId,
    selectedNodeId,
    draftTargetMapId,
    draftTargetNodeId,
  });

  // 選択中のマップやノードが候補から消えたときは state 自体を正規化し、フォールバック先での再選択や再登場時の復活を防ぐ
  if (!isContextChanged) {
    if (draftTargetMapId !== effectiveTargetMapId) {
      setDraftTargetMapId(effectiveTargetMapId);
      setDraftTargetNodeId("");
      setErrorReason(null);
    } else if (draftTargetNodeId !== "" && effectiveTargetNodeId === "") {
      setDraftTargetNodeId("");
    }
  }

  const errorMessage = errorReason === null ? null : formatNodeMapLinkFailure(errorReason);
  const isNodeFieldError = errorReason === "invalid-node-id" || errorReason === "self-node";
  const isMapFieldError = errorReason !== null && !isNodeFieldError;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedNode === null) return;

    let targetNodeId: number | undefined;
    if (effectiveTargetNodeId !== "") {
      const parsed = parsePositiveNodeIdString(effectiveTargetNodeId);
      if (parsed === null) {
        setErrorReason("invalid-node-id");
        return;
      }
      targetNodeId = parsed;
    }

    const input =
      targetNodeId === undefined
        ? { targetMapId: effectiveTargetMapId }
        : { targetMapId: effectiveTargetMapId, targetNodeId };
    const outcome = onAddMapLink(selectedNode.id, input);
    if (outcome.ok) {
      setDraftTargetNodeId("");
      setErrorReason(null);
      return;
    }
    setErrorReason(outcome.reason);
  };

  // IME 変換中や押し続け（repeat）の Enter では送信しない（L-408・L-474）
  const handleFormKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Enter") return;
    if (event.nativeEvent.isComposing || event.keyCode === 229 || event.repeat) {
      event.preventDefault();
    }
  };

  // 削除は値渡しで行い（L-035）、押したボタンが消えたあとのフォーカスを対象マップ選択へ戻す（L-397）
  const handleRemove = (target: NodeMapLink) => {
    if (selectedNode === null) return;
    if (onRemoveMapLink(selectedNode.id, target)) {
      setErrorReason(null);
    }
    mapSelectRef.current?.focus();
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        マップ間リンク
      </h2>
      {selectedNode === null ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">ノードを選択してください</p>
      ) : (
        <>
          {mapLinks.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">マップ間リンクはありません</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {mapLinks.map((link) => (
                <NodeMapLinkItem
                  key={nodeMapLinkKey(link)}
                  link={link}
                  resolved={resolveNodeMapLink(link, corpus, {
                    storageMode,
                    currentMapId,
                  })}
                  onNavigate={onNavigateToMapTarget}
                  onRemove={handleRemove}
                />
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p id={countId} className="text-xs text-zinc-500 dark:text-zinc-400">
              {`${mapLinks.length} / ${NODE_MAP_LINKS_MAX_COUNT} 件`}
            </p>
            {/* ライブリージョンは常に描画し、中身だけを替える */}
            <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
              {isAtLimit ? `上限（${NODE_MAP_LINKS_MAX_COUNT} 件）に達しました` : ""}
            </p>
          </div>
          <form
            noValidate
            onSubmit={handleSubmit}
            onKeyDown={handleFormKeyDown}
            className="flex flex-col gap-2"
          >
            <div className="flex flex-col gap-1">
              <label
                htmlFor={mapSelectId}
                className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                対象マップ
              </label>
              <select
                ref={mapSelectRef}
                id={mapSelectId}
                value={effectiveTargetMapId}
                aria-invalid={isMapFieldError ? "true" : undefined}
                aria-describedby={isMapFieldError ? `${countId} ${errorId}` : countId}
                onChange={(event) => {
                  setDraftTargetMapId(event.target.value);
                  setDraftTargetNodeId("");
                  setErrorReason(null);
                }}
                className={selectClassName}
              >
                {maps.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor={nodeSelectId}
                className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                対象ノード（任意）
              </label>
              <select
                id={nodeSelectId}
                value={effectiveTargetNodeId}
                aria-invalid={isNodeFieldError ? "true" : undefined}
                aria-describedby={isNodeFieldError ? `${countId} ${errorId}` : undefined}
                onChange={(event) => {
                  setDraftTargetNodeId(event.target.value);
                  setErrorReason(null);
                }}
                className={selectClassName}
              >
                <option value="">マップ全体</option>
                {selectableNodes.map((node) => (
                  <option key={node.id} value={String(node.id)}>
                    {getNodeDisplayLabel(node.label)}
                  </option>
                ))}
              </select>
              {isSelectedMapUnreadable && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  このマップは読み取れないため、特定のノードは選択できません
                </p>
              )}
            </div>
            {errorMessage !== null && (
              <p id={errorId} role="alert" className="text-xs text-red-700 dark:text-red-300">
                {errorMessage}
              </p>
            )}
            <div>
              <button type="submit" className={buttonClassName}>
                追加
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
