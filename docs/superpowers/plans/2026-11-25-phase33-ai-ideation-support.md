# Phase 33（078–081）: AI発想・整理支援 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: サブエージェント駆動。作業場所: メインのチェックアウト `feat/phase33-ai-ideation-support`（worktree 不使用）。**Do not commit** during `/feature`.

**Goal:** 選んだ枝に対し、子候補・分類／並べ替え・重複検出・不足観点を AI 提案し、差分プレビュー採否のうえ構造変更を 1 Undo で適用できるようにする。

**Architecture:** Phase 32 の `aiAssist` 基盤を拡張。属性提案は既存のまま、構造提案は `applyAiStructureProposals`＋`applyStateChange`。

**Tech Stack:** React, TypeScript, Jest, 既存 Anthropic/OpenAI アダプタ

## Global Constraints

- 設計: `docs/superpowers/specs/2026-11-25-phase33-ai-ideation-support-design.md`
- 範囲は **078–081 のみ**。082–084 の入口・API・UI を足さない
- L-061 inventory 必須。L-001 / L-036 / L-063 / L-1133
- L-825: ノード任意属性を増やさない
- TDD。コミットしない。日本語 UI。`cd client && npm run verify`
- 知見: L-061, L-001, L-017, L-036, L-037, L-057, L-058, L-063, L-203, L-635, L-752, L-825, L-1133
- ROADMAP 078–081 を完了、082–084 は未完了のまま

### Kind 対応表（入口・提案 kind を混同しない）

| `AiAssistKind`（入口） | POST | パレット id | 提案 `AiProposal.kind` |
|------------------------|------|-------------|-------------------------|
| `child-candidates` | `/api/ai-assist/child-candidates` | `edit.open-ai-child-candidates` | `add-child` |
| `classify-reorder` | `/api/ai-assist/classify-reorder` | `edit.open-ai-classify-reorder` | `reparent` / `reorder-siblings` |
| `duplicates` | `/api/ai-assist/duplicates` | `edit.open-ai-duplicates` | `merge-pair` |
| `missing-perspectives` | `/api/ai-assist/missing-perspectives` | `edit.open-ai-missing-perspectives` | `add-child` / `add-sibling` |

---

### Task 0: L-061 inventory

**Files:** Create `docs/superpowers/specs/2026-11-25-phase33-ai-ideation-support-inventory.md`

- Phase 32 inventory §1.3 同型: `editorShortcutsEnabled` 積に `aiAssist.screen === "closed"`、ダイアログ中 inert
- 4 パレット ID・`CommandAvailabilityContext` 4 件・適用時 `isNodeOpBlocked` → `rejected`
- テスト所有者: domain＝Task2、UI＝Task4

- [x] inventory 作成

---

### Task 1: 出力検証・定数・入口可否・指紋

**Files:**
- `aiAssistOutput.ts` + tests
- `aiBranchInput.ts`（maxNodes 定数）
- `aiAssistEntryAvailability.ts`
- 指紋: `aiStructureInputFingerprintOf(nodes, rootId, kind: AiAssistKind)`（課題別 maxNodes）

**Interfaces:**

```ts
validateChildCandidatesOutput(value: unknown): ...
validateClassifyReorderOutput(value: unknown, branchIds: ReadonlySet<number>): ...
validateDuplicatesOutput(value: unknown, branchIds: ReadonlySet<number>, mergeCtx: {
  nodes: readonly Node[]; visibleNodeIds: ReadonlySet<number>; currentMapId: string;
}): ...  // サーバーは branch 全 ID を visible、body.mapId を currentMapId
validateMissingPerspectivesOutput(value: unknown, rootHasParent: boolean): ...
```

- [x] RED/GREEN: 各 validate・入口可否・指紋

---

### Task 2: 提案型・stale・一括適用

**Files:**
- `aiProposal.ts` / `aiStructureProposal.ts`
- `nodeBranchMove.ts` 利用（reparent → `moveNodeBranch`）
- Create: 全順列 reorder domain（例 `reorderAllSiblings(nodes, parentId, childIds)`）
- Create: anchor 直後 sibling 挿入 domain（例 `insertSiblingAfter(nodes, anchorId, newId, label)`）。hook `addSiblingNode` とは別名
- `useNodes.ts`: `applyStateChange` / `applyStateChangeWithOutcome`＋`allocateEntityIds`

**Interfaces:**

```ts
type AcceptedAiStructureProposal =
  | { proposal: Extract<AiProposal, { kind: "add-child" | "add-sibling" | "reparent" | "reorder-siblings" }> }
  | { proposal: Extract<AiProposal, { kind: "merge-pair" }> };

type ApplyAiStructureProposalsResult =
  | { ok: true; state: NodeMapState; appliedCount: number }
  | { ok: false; reason: "stale"; staleKeys: string[] }
  | { ok: false; reason: "nothing-to-apply" | "placement-failed" };

applyAiStructureProposals(args: {
  state: NodeMapState;
  accepted: readonly AcceptedAiStructureProposal[];
  rebuildInputFingerprint: (rootId: number, kind: AiAssistKind) => string | null;
  allocateNodeIds: (count: number) => readonly number[];
  mergeJoiner: string;
  visibleNodeIds: ReadonlySet<number>;
  currentMapId: string;
}): ApplyAiStructureProposalsResult;
```

- [x] RED/GREEN: stale 全体不適用；順 merge→reparent(`moveNodeBranch`)→reorder 全順列→add；placement-failed / rejected

---

### Task 3: サーバー 4 ルート

**Files:** `aiAssistTasks.ts` / `aiAssistPrompt.ts` / 4 `route.ts` + tests

- 080 サーバー validate は枝 ID＝visible、`mapId`＝currentMapId
- [x] RED/GREEN: 各 POST；実 SDK 不使用

---

### Task 4: クライアント配線・UI

**Files:**
- `aiAssistClient.ts`、`aiAssistSendPlan.ts`（または同等）、`aiAssistDialogState.ts`、`useAiAssistDialog.ts`
- ダイアログ view、`MapEditor.tsx`、`NodeDetailPanel.tsx`
- `commandTypes.ts`、`resolveCommandAvailability.ts`、`commandPaletteCoreDispatch.ts`、`COMMAND_CATALOG`
- 合成: `isNodeTargetOperationBlocked(canvasSelection)` × 各 `*Entry.enabled`

- [x] RED/GREEN: 4 入口＋パレット；フロー；関連線選択中不可；082–084 無し

---

### Task 5: docs・ROADMAP・verify

設計 §6 同期先 + `npm run verify`

- [x] L-203；ROADMAP 078–081 `[x]`、082–084 未完了；verify 成功

## プランレビュー後の記録

- feature-plan 第1周 Blocking5 → Interfaces／Files 反映
- feature-plan 第2周 Blocking11 → 型名・moveNodeBranch・全順列／sibling domain・validate 名／L-061 Files 反映
