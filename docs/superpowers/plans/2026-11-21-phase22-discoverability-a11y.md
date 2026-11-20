# Phase 22: 操作の発見性とアクセシビリティ 実装プラン

作成日: 2026-11-21  
**Goal:** Ctrl/Cmd+K とヘッダー「コマンド」から既存操作を名前検索で実行できるコマンドパレットを足し、アウトラインを構造ナビ／編集の主経路として読み上げ可能なまま強化する（キャンバスにフル ARIA tree は載せない）。対象は ROADMAP Phase 22 の 2 項目（候補020「コマンドパレット」、候補021「キーボード操作と読み上げ対応」）。  
**設計書:** [`docs/superpowers/specs/2026-11-21-phase22-discoverability-a11y.md`](../specs/2026-11-21-phase22-discoverability-a11y.md)  
作業 worktree: `C:\Users\msyks\Documents\draw-my-map\.worktrees\phase-22-discoverability`

> **For agentic workers:** AGENTS.md によりサブエージェント駆動で実装する（インライン実行は使わない）。各 Task は `- [ ]` の RED / 実装 / GREEN で追跡する。

---

## Global Constraints

1. **サブエージェント駆動・1 タスク逐次:** 各 Task は独立した実装サブエージェントが実行し、完了後に別サブエージェントで二段階レビュー（仕様適合 → コード品質）を通過してから次へ進む。前タスクの `Interfaces` と本節・設計書だけを渡し、メイン会話履歴には依存させない。
2. **TDD:** 実装コードより先に失敗するテストを書き、対象テストで RED を確認してから最小実装し、同じコマンドで GREEN を確認する。
3. **worktree:** 作業・検証は `C:\Users\msyks\Documents\draw-my-map\.worktrees\phase-22-discoverability` のみ。`client` 配下で検証する。
4. **対象テストコマンド:** `cd client && npm test -- --runInBand <パス…>`。最終 Task で `npm run verify`。
5. **コミットしない:** 本プラン実行中は `git commit` / `git add` を行わない（後続 `/commit-ja` で責務分割コミット）。
6. **新規 npm 依存なし。** マップ V3・編集履歴・Undo スタックの意味を変えない。パレット開閉・検索語・ハイライトはセッション内 UI 状態のみ。
7. **第1版必須境界:** ヘッダー `operationControls` ／アウトラインツールバーと同等の操作 ＋ 確認ダイアログ系 `open*` が完了条件・必須テスト対象。入出力・ライブラリ・閲覧ナビは **第1版カタログに載せない**（後続）。
8. **知見（必ず守る）:**
   - **L-015:** 構造変更・削除・複製は正本 `nodes` と全 ID 集合のみ。表示投影配列を保存・編集 API に渡さない。
   - **L-037:** パレットは開いた `mapId` / `documentRevision` と組にする。世代が進んだら `closeReason: "stale"`。実行直前に可否を再評価。**閉じてから遅延実行しない**（同一同期で可否再評価 → 委譲 → close）。
   - **L-061:** `commandPalette.screen === "closed"` を `editorShortcutsEnabled` 積・ルート `inert`・全ショートカット入口表に足す。ダイアログ連鎖の中間で shortcuts を真にしない。
   - **L-155:** `dismiss` / `stale` は設計書 §5.1 の復帰列（`focusRequest: restore-opener`）。`execute-dialog` は直前復帰せず open 先トラップへ。`execute-immediate` は `focusRequest` なし（表示切替後のフォーカスは Task 4 列）。消えた要素にフォーカスを残さない。
   - **L-472:** 並べ替え・インデントの基準は配列上の `parentId` 関係。キャンバス Y 座標順と混ぜない。
   - **L-688:** 破壊的操作は既存確認ダイアログ経由。パレットは `open*` のみ。確認内容が見えない状態で承認できる経路を作らない。`opensDialog: true` は「次ダイアログを開く」メタであり、L-688 対象（破壊的確定の確認必須）とは別概念（下表注記）。

---

## 第1版必須コマンド ID（カタログ定数）

第1版の `COMMAND_CATALOG` は **下表の必須 ID のみ**。入出力・ライブラリ・閲覧ナビ等の任意 ID は後続フェーズで追加する（第1版に機構だけの行を載せない）。

表示名はパレット用。ヘッダーボタン名と違う場合は aliases にヘッダー名を入れる。`view.fit-all` の表示名は `resolveCommandLabel(def, ctx)` で動的解決（集中中は「表示中の枝に合わせる」、それ以外は「全体に合わせる」。ID は変えない）。

| ID | 表示名（既定） | カテゴリ | 委譲先（MapEditor 既存コア） | opensDialog | 確認 UI（L-688） |
| --- | --- | --- | --- | --- | --- |
| `view.map` | マップ表示へ切替 | 表示 | `changeViewMode("map")` | false | なし |
| `view.outline` | アウトライン表示へ切替 | 表示 | `changeViewMode("outline")` | false | なし |
| `view.fit-all` | 全体に合わせる（動的ラベル可） | 表示 | `viewportHandleRef.fitNodes(displayState.fitNodes, …)` | false | なし |
| `view.fit-selection` | 選択に合わせる | 表示 | `viewportHandleRef.fitNodes(selectedFitNodes, …)` | false | なし |
| `view.focus-branch` | 枝に集中 | 表示 | `setFocusRootId(selectedNodeId)` | false | なし |
| `view.focus-clear` | 集中表示を終了 | 表示 | `setFocusRootId(null)` | false | なし |
| `view.expand-subtree` | 枝を一括展開 | 表示 | `branchCollapse.setSubtreeCollapsed(selectedNodeId, false)` | false | なし |
| `view.collapse-subtree` | 枝を一括折りたたみ | 表示 | `branchCollapse.setSubtreeCollapsed(selectedNodeId, true)` | false | なし |
| `edit.undo` | 元に戻す | 編集 | `undo` | false | なし |
| `edit.redo` | やり直す | 編集 | `redo` | false | なし |
| `edit.duplicate-branch` | 枝を複製 | 編集 | `duplication.duplicateSelected` のコア | false | なし |
| `edit.delete-node-only` | ノードだけ削除 | 編集 | `nodeOnlyDeletion`／`outlineActions.deleteSelected` のコア | false | なし |
| `edit.insert-parent` | 親を挿入 | 編集 | `nodeParentInsertion.insertSelected` のコア | false | なし |
| `edit.move-sibling-up` | 兄弟を上へ | 編集 | `moveSelectedSiblingUp`／`outlineActions.move("up")` のコア | false | なし |
| `edit.move-sibling-down` | 兄弟を下へ | 編集 | `moveSelectedSiblingDown`／`outlineActions.move("down")` のコア | false | なし |
| `edit.indent` | 階層を下げる | 編集 | `indentSelected`／`outlineActions.changeIndent("indent")` のコア | false | なし |
| `edit.outdent` | 階層を上げる | 編集 | `outdentSelected`／`outlineActions.changeIndent("outdent")` のコア | false | なし |
| `edit.open-label-replace` | ラベルを一括置換… | 編集 | `labelReplace.open` | true | 既存 `LabelReplaceDialog`（L-688） |
| `edit.open-branch-move` | 枝を別マップへ移動… | 編集 | `branchMove.open` | true | 既存 `BranchMoveDialog`（L-688） |
| `edit.open-node-split` | ノードを分割… | 編集 | `nodeSplit.open` | true | 既存 `NodeSplitDialog`（L-688） |
| `edit.open-node-merge` | ノードを統合… | 編集 | `nodeMerge.open` | true | 既存 `NodeMergeDialog`（L-688） |
| `search.focus-in-map` | マップ内検索へフォーカス | 検索 | `NodeSearchBox` 入力へ focus（マップ時のみ可） | false | なし |
| `search.open-cross-map` | 全マップ検索… | 検索 | `crossMapDialogs.openCrossMapSearch` | true | 既存 `CrossMapSearchDialog`（確認ダイアログではないが opensDialog） |
| `outline.add-root` | ルート追加 | アウトライン | `outlineActions.addRoot` のコア | false | なし |
| `outline.add-child` | 子を追加 | アウトライン | `outlineActions.addChild` のコア | false | なし |
| `outline.add-sibling` | 兄弟を末尾に追加 | アウトライン | `outlineActions.addSibling` のコア | false | なし |
| `outline.begin-edit` | ラベル編集 | アウトライン | `outlineActions.beginEdit(selectedNodeId)` のコア | false | なし |

**注記（opensDialog と L-688）:**

- `opensDialog: true` = パレット実行時に `close("execute-dialog")` の直後、同一同期で次ダイアログ／パネルを `open*` するコマンド。
- L-688 対象 = 破壊的確定を既存確認 UI 経由でのみ行うもの（上表「確認 UI」列が既存確認ダイアログ）。`search.open-cross-map` は opensDialog だが L-688 の破壊的確認対象ではない。
- パレットはいずれの opensDialog でも確定 API を直接呼ばない。

エイリアス例: `Undo`→`edit.undo`、`フィット`→`view.fit-all`、`一括置換`→`edit.open-label-replace`、`枝を移動`→`edit.open-branch-move`。`Cmd+K` は起動専用でカタログに載せない。

### 後続（第1版カタログ外・参考）

| ID | 表示名 | 委譲先 |
| --- | --- | --- |
| `view.nav-back` | 閲覧を戻る | `viewNavigation.travel("back")` |
| `view.nav-forward` | 閲覧を進む | `viewNavigation.travel("forward")` |
| `io.export-json` | JSON 書き出し | `persistence.exportJson` |
| `io.import-json` | JSON 読み込み | `persistence.importJsonFile` |
| `io.export-png` | PNG 書き出し | `imageExport.exportPng` |
| `io.export-svg` | SVG 書き出し | `imageExport.exportSvg` |
| `io.export-markdown` | Markdown 書き出し | `outlineExport.exportMarkdown` |
| `io.export-plain` | テキスト書き出し | `outlineExport.exportPlainText` |
| `io.open-outline-import` | 箇条書き取り込み… | `outlineImport.open` |
| `library.open-map-list` | マップ一覧… | 既存 `mapControls` の一覧 open |

---

## Task 1: コマンドカタログ・可否純関数・検索フィルタ

**Files:**
- Create: `client/src/domain/commands/commandTypes.ts`
- Create: `client/src/domain/commands/commandCatalog.ts`
- Create: `client/src/domain/commands/resolveCommandAvailability.ts`
- Create: `client/src/domain/commands/resolveCommandLabel.ts`
- Create: `client/src/domain/commands/filterCommandCatalog.ts`
- Create: `client/src/components/map/commandPaletteShortcut.ts`
- Test: `client/src/domain/commands/__tests__/commandCatalog.test.ts`
- Test: `client/src/domain/commands/__tests__/resolveCommandAvailability.test.ts`
- Test: `client/src/domain/commands/__tests__/resolveCommandLabel.test.ts`
- Test: `client/src/domain/commands/__tests__/filterCommandCatalog.test.ts`
- Test: `client/src/components/map/__tests__/commandPaletteShortcut.test.ts`
- Reuse: `client/src/domain/search/nodeLabelSearch.ts` の `normalizeNodeSearchQuery`（NFKC＋小文字＋trim）
- Reuse: `client/src/components/map/editableTarget.ts` の `isEditableTarget`
- Reuse: `client/src/components/map/mapHistoryShortcut.ts` の `isProcessableKeyEvent` / `hasSingleCommandModifier`

- [x] **RED チェック:** 上記 5 テストを先に書き、`npm test -- --runInBand domain/commands/__tests__/commandCatalog.test.ts domain/commands/__tests__/resolveCommandAvailability.test.ts domain/commands/__tests__/resolveCommandLabel.test.ts domain/commands/__tests__/filterCommandCatalog.test.ts components/map/__tests__/commandPaletteShortcut.test.ts` でモジュール未存在／期待不一致により失敗することを記録する。
- [x] **実装チェック:** カタログ定数・可否・動的ラベル・検索・ショートカット判定の純関数を実装する。実行クロージャは持たない（ID とメタデータと可否のみ）。第1版カタログは必須 ID のみ。
- [x] **GREEN チェック:** 同じ `npm test -- --runInBand …` が全通過。`npm run typecheck` 成功。

### RED で固定する振る舞い

1. **カタログ:** 第1版必須 ID がすべて登録され、**必須以外の ID は含まれない**。カテゴリ順（表示 → 編集 → 検索 → アウトライン）・登録順が安定。複合キーを文字列連結で作らない。
2. **opensDialog 固定:** 上表どおり。`edit.open-label-replace` / `edit.open-branch-move` / `edit.open-node-split` / `edit.open-node-merge` / `search.open-cross-map` のみ `opensDialog: true`。それ以外の必須 ID は `false`。
3. **検索:** `normalizeNodeSearchQuery` で照合。対象は表示名（`resolveCommandLabel` 後）・aliases・カテゴリ名。空クエリは推奨セット（モード不一致除外、モード一致の不可は残す）。非空は部分一致した不可も残す。いずれも最大 50。超過時は `overflowCount`（UI の「他 N 件」用。件数自体を Task 1 で固定）。
4. **可否:** `CommandAvailabilityContext` から既存コントロールと同趣旨の `enabled` / `disabledReason` / `modeMismatch` を返す。マップ専用はアウトラインで `modeMismatch`、アウトライン専用はマップで `modeMismatch`。
5. **動的ラベル:** `resolveCommandLabel(def, ctx)` — `view.fit-all` は `ctx.focusing === true` のとき「表示中の枝に合わせる」、それ以外は定義の `label`（「全体に合わせる」）。他 ID は `def.label` を返す。
6. **ショートカット:** `isCommandPaletteShortcut(event)` は Ctrl/Cmd+K（単一修飾・Shift なし）、`isEditableTarget` 真・IME（`isComposing` または `keyCode === 229`）・`!isProcessableKeyEvent` で偽。

### Interfaces

```ts
// commandTypes.ts
export type CommandId = string; // 安定英小文字定数（上表）
export type CommandCategoryId = "view" | "edit" | "search" | "outline" | "io" | "library";
export type CommandDefinition = {
  readonly id: CommandId;
  readonly categoryId: CommandCategoryId;
  readonly categoryLabel: string; // 「表示」「編集」…
  readonly label: string; // 既定表示名。動的名は resolveCommandLabel
  readonly aliases: readonly string[];
  readonly opensDialog: boolean; // 次ダイアログ open*（execute-dialog）。L-688 対象とは別概念
  readonly requiredInV1: boolean; // 第1版はすべて true
};
export type CommandAvailability = {
  readonly enabled: boolean;
  readonly modeMismatch: boolean;
  readonly disabledReason: string | null;
};
/**
 * 保護モード・競合・外部削除はフィールドを明示する（can* に畳み込まない）。
 * 各 can* はヘッダー／既存入口と同趣旨の「操作そのものの可否」。
 * resolveCommandAvailability が isProtectedMode / hasConflict / isExternallyDeleted
 * を見て enabled=false + disabledReason を付与する。
 */
export type CommandAvailabilityContext = {
  readonly viewMode: "map" | "outline";
  readonly selectedNodeId: number | null;
  readonly focusing: boolean; // focusRootId != null。resolveCommandLabel / fit-all 用
  readonly isProtectedMode: boolean;
  readonly hasConflict: boolean;
  readonly isExternallyDeleted: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly canFitAll: boolean;
  readonly canFitSelection: boolean;
  readonly canFocusBranch: boolean;
  readonly canExpandSubtree: boolean;
  readonly canCollapseSubtree: boolean;
  readonly canDuplicate: boolean;
  readonly canDeleteNodeOnly: boolean;
  readonly canInsertParent: boolean;
  readonly canMoveSiblingUp: boolean;
  readonly canMoveSiblingDown: boolean;
  readonly canIndent: boolean;
  readonly canOutdent: boolean;
  readonly canOpenLabelReplace: boolean;
  readonly canOpenBranchMove: boolean;
  readonly canOpenNodeSplit: boolean;
  readonly nodeSplitDisabledReason: string | null;
  readonly canOpenNodeMerge: boolean;
  readonly nodeMergeDisabledReason: string | null;
  readonly canFocusInMapSearch: boolean;
  readonly canOpenCrossMapSearch: boolean;
  readonly outlineCanAddRoot: boolean;
  readonly outlineCanAddRelated: boolean;
  readonly outlineCanEdit: boolean;
};
export type FilteredCommand = {
  readonly definition: CommandDefinition;
  readonly availability: CommandAvailability;
  readonly displayLabel: string; // resolveCommandLabel の結果
};
export type FilterCommandCatalogResult = {
  readonly items: readonly FilteredCommand[]; // ≤50
  readonly overflowCount: number; // 一致総数 - items.length（「他 N 件」）
};

// commandCatalog.ts
export const COMMAND_CATALOG: readonly CommandDefinition[]; // 必須 ID のみ
export function getCommandDefinition(id: CommandId): CommandDefinition | undefined;

// resolveCommandAvailability.ts
export function resolveCommandAvailability(
  id: CommandId,
  context: CommandAvailabilityContext,
): CommandAvailability;

// resolveCommandLabel.ts
export function resolveCommandLabel(
  def: CommandDefinition,
  context: CommandAvailabilityContext,
): string;

// filterCommandCatalog.ts
export function filterCommandCatalog(
  query: string,
  context: CommandAvailabilityContext,
  options?: { readonly limit?: number }, // 既定 50
): FilterCommandCatalogResult;

// commandPaletteShortcut.ts
export function isCommandPaletteShortcut(event: KeyboardEvent): boolean;
```

---

## Task 2: コマンドパレット UI（ダイアログ・listbox・activedescendant・拒否 live）

**Files:**
- Create: `client/src/hooks/commandPaletteState.ts`
- Create: `client/src/hooks/useCommandPalette.ts`
- Create: `client/src/components/layout/CommandPaletteDialog.tsx`
- Create: `client/src/components/layout/CommandPaletteControl.tsx`
- Create: `client/src/components/map/useCommandPaletteShortcut.ts`
- Test: `client/src/hooks/__tests__/commandPaletteState.test.ts`
- Test: `client/src/hooks/__tests__/useCommandPalette.test.tsx`
- Test: `client/src/components/layout/__tests__/CommandPaletteDialog.test.tsx`
- Test: `client/src/components/layout/__tests__/CommandPaletteControl.test.tsx`
- Test: `client/src/components/map/__tests__/useCommandPaletteShortcut.test.ts`
- Pattern copy: `client/src/hooks/branchMoveDialogState.ts` / `client/src/components/layout/BranchMoveDialog.tsx` / `client/src/components/layout/useDialogFocusTrap.ts` / `client/src/components/layout/NodeSearchBox.tsx`（listbox + `aria-activedescendant`）
- Reuse: `client/src/components/map/commandPaletteShortcut.ts` の `isCommandPaletteShortcut`（Task 1）
- Reuse: `client/src/components/map/useCrossMapSearchShortcut.ts`（`useLatestRef` + window keydown）

- [x] **RED チェック:** 上記テストを先に書き、`npm test -- --runInBand hooks/__tests__/commandPaletteState.test.ts hooks/__tests__/useCommandPalette.test.tsx components/layout/__tests__/CommandPaletteDialog.test.tsx components/layout/__tests__/CommandPaletteControl.test.tsx components/map/__tests__/useCommandPaletteShortcut.test.ts` で RED を記録する。
- [x] **実装チェック:** 状態純関数・フック・ダイアログ・ヘッダー「コマンド」ボタン・ショートカットフックを実装。**Dialog は `onExecuteActive` のみ**（active 行の ID 解決は親）。ドメイン操作の新経路を作らない。
- [x] **GREEN チェック:** 同じテスト全通過。`npm run typecheck` 成功。

### RED で固定する振る舞い

1. **状態:** `screen: "closed" | "open"`。`open` で検索語空・ハイライト先頭・opened `mapId`/`documentRevision` 記録・直前 `activeElement` 控え。`close(reason)` で `closeReason` と（理由に応じた）`focusRequest` をセット。
2. **closeReason:** `"dismiss" | "execute-immediate" | "execute-dialog" | "stale"`。
   - `dismiss` / `stale` → `focusRequest: { kind: "restore-opener" }`
   - `execute-immediate` → `focusRequest: null`（フォーカスは呼び出し側。表示切替は Task 4 列）
   - `execute-dialog` → `focusRequest: null`（open 先トラップへ）
3. **ダイアログ a11y:** `role="dialog"` `aria-modal="true"` タイトル「コマンドパレット」。**閉じるボタン必須**（クリックで `onDismiss`）。検索欄 `aria-controls`→listbox。候補 `role="option"`。ハイライトは **listbox + `aria-activedescendant` のみ**（フォーカスは検索欄。roving tabindex なし）。不可は `aria-disabled`＋理由。
4. **キー:** ↑↓（端で停止・不可も移動可）、Home/End、Enter（可なら `onExecuteActive`、不可ならパレット内 `role="status"` live に理由・開いたまま）、Escape→`onDismiss`。Tab は `useDialogFocusTrap`（検索欄と閉じるボタン等。オプションへ Tab で入らない）。
5. **オーバーレイ:** 既存ダイアログと同じ誤閉じ防止。オーバーレイ確定クリックで `onDismiss`。`handleDialogClickCapture` / `onMouseClick` で `dialogMouseClickedAtRef` 更新パターン。
6. **overflowCount:** `overflowCount > 0` のとき「他 {overflowCount} 件」を status 表示（L-160）。`overflowCount === 0` では出さない。
7. **Control:** ボタン名「コマンド」、`aria-haspopup="dialog"`、`aria-expanded`、`aria-keyshortcuts` に `Control+K Meta+K`。`onOpen` は親がゲート（Task 3: `editorShortcutsEnabled` かつ他ダイアログ非表示）。
8. **Shortcut hook:** `enabled` 偽または既に open のとき発火しない。発火時 `preventDefault` + `onOpen`。判定は Reuse の `isCommandPaletteShortcut`。
9. **useCommandPalette:** Options に `mapId` / `documentRevision`。変化で `markCommandPaletteStaleIfNeeded` → `stale` 自動 close。

### Interfaces

```ts
// commandPaletteState.ts
export type CommandPaletteCloseReason =
  | "dismiss"
  | "execute-immediate"
  | "execute-dialog"
  | "stale";
export type CommandPaletteFocusRequest =
  | { readonly kind: "restore-opener" } // dismiss / stale のみ。MapEditor が §5.1 列を適用
  | null; // execute-immediate / execute-dialog
export type CommandPaletteState = {
  readonly screen: "closed" | "open";
  readonly query: string;
  readonly activeIndex: number;
  readonly openedMapId: string | null;
  readonly openedRevision: number;
  readonly closeReason: CommandPaletteCloseReason | null;
  readonly focusRequest: CommandPaletteFocusRequest;
  readonly rejectMessage: string | null;
  readonly rejectSequence: number;
};
export function createCommandPaletteState(): CommandPaletteState;
export function openCommandPalette(
  state: CommandPaletteState,
  opened: { mapId: string; revision: number },
): CommandPaletteState;
export function closeCommandPalette(
  state: CommandPaletteState,
  reason: CommandPaletteCloseReason,
): CommandPaletteState;
export function setCommandPaletteQuery(state: CommandPaletteState, query: string): CommandPaletteState;
export function moveCommandPaletteHighlight(
  state: CommandPaletteState,
  action: "up" | "down" | "home" | "end",
  itemCount: number,
): CommandPaletteState;
export function setCommandPaletteReject(state: CommandPaletteState, message: string): CommandPaletteState;
export function consumeCommandPaletteFocusRequest(state: CommandPaletteState): CommandPaletteState;
export function markCommandPaletteStaleIfNeeded(
  state: CommandPaletteState,
  current: { mapId: string; revision: number },
): CommandPaletteState;

// useCommandPalette.ts
export type UseCommandPaletteOptions = {
  readonly mapId: string;
  readonly documentRevision: number;
};
export type UseCommandPaletteResult = {
  screen: "closed" | "open";
  query: string;
  activeIndex: number;
  rejectMessage: string | null;
  rejectSequence: number;
  focusRequest: CommandPaletteFocusRequest;
  closeReason: CommandPaletteCloseReason | null;
  open: () => void;
  close: (reason: CommandPaletteCloseReason) => void;
  setQuery: (query: string) => void;
  moveHighlight: (action: "up" | "down" | "home" | "end", itemCount: number) => void;
  setReject: (message: string) => void;
  consumeFocusRequest: () => void;
};
export function useCommandPalette(options: UseCommandPaletteOptions): UseCommandPaletteResult;
// mapId / documentRevision 変化で stale 自動 close（L-037）

// CommandPaletteDialog.tsx — 実行は onExecuteActive のみ（親が activeIndex → id を解決）
export type CommandPaletteDialogProps = {
  open: boolean;
  query: string;
  items: readonly FilteredCommand[];
  overflowCount: number;
  activeIndex: number;
  rejectMessage: string | null;
  rejectSequence: number;
  onQueryChange: (query: string) => void;
  onMoveHighlight: (action: "up" | "down" | "home" | "end") => void;
  onExecuteActive: () => void;
  onDismiss: () => void; // 閉じるボタン・Escape・オーバーレイ
  onMouseClick: () => void;
};

// CommandPaletteControl.tsx
export type CommandPaletteControlProps = {
  expanded: boolean;
  onOpen: () => void; // 親が editorShortcutsEnabled / 他ダイアログ中をゲート
  buttonRef: RefObject<HTMLButtonElement | null>;
};

// useCommandPaletteShortcut.ts
export function useCommandPaletteShortcut(options: {
  enabled: boolean;
  onOpen: () => void;
}): void;
```

---

## Task 3: MapEditor 配線（起動・積・closeReason・ダイアログ連鎖）

**Files:**
- Modify: `client/src/components/map/MapEditor.tsx`
  - `editorShortcutsEnabled` 積（現行 L498–506 付近）に `&& commandPalette.screen === "closed"` を追加
  - `useCommandPalette({ mapId, documentRevision })` / `useCommandPaletteShortcut` / ヘッダー「コマンド」/ ルート外 `CommandPaletteDialog` 描画
  - **実行ワイヤリング:** 必須 ID → 既存ハンドラの **enabled ガードを迂回したコア関数への同期委譲**（ボタンの `disabled` / `if (!can*) return` を通さない。パレット側で `resolveCommandAvailability` を実行直前に再評価してからコアを呼ぶ）。`opensDialog` は同一同期で `close("execute-dialog")` → `open*`。即時成功は同一同期でコア実行 → `close("execute-immediate")`。**閉じてから `setTimeout`／遅延実行しない**
  - `changeViewMode` をパレット open 中も止める（積経由で既に不可）
  - `dismiss`/`stale` のみ `focusRequest: restore-opener` → §5.1 列。`execute-immediate` の表示切替は Task 4 フォーカス列（`focusRequest` なし）
  - 即時成功の notice を既存 `MapOperationNoticeList` 系統へ（新規枠を増やさず再利用。ハンドラが既に notice を出す場合は重複成功文言を出さない）
- Modify: `client/src/components/layout/NodeSearchBox.tsx` — マップ内検索フォーカス用に `inputRef` または `focus()` 可能な imperative / callback ref を公開（破壊的変更を避け、既存 props は維持）
- Modify: `client/src/components/layout/AppHeader.tsx` — **`operationControls` の先頭に**パレット起動ボタン（`CommandPaletteControl`）を必須配置できる受け口にする（現状が先頭挿入できない場合は prop／スロットを足す）
- Test: `client/src/components/map/__tests__/MapEditorCommandPalette.test.tsx`（新規。既存 `MapEditor.test.tsx` / `MapEditorOutline.test.tsx` の巨大化を避ける）
- Regression（壊さないこと）: `client/src/components/map/__tests__/MapEditor.test.tsx`、`MapEditorOutline.test.tsx`、`useCrossMapSearchShortcut` 関連、履歴ショートカット関連

- [x] **RED チェック:** `MapEditorCommandPalette.test.tsx` を先に書き、`npm test -- --runInBand components/map/__tests__/MapEditorCommandPalette.test.tsx` で RED を記録する。入口表の各行と、必須 ID の `opensDialog` 表（true → 連鎖／false → execute-immediate）に寄せたケースを含める。
- [x] **実装チェック:** MapEditor 配線・検索フォーカス接点・連鎖・stale・notice を実装。パレット専用のドメイン操作経路を作らない（コア関数の共有呼び出しのみ）。
- [x] **GREEN チェック:** `npm test -- --runInBand components/map/__tests__/MapEditorCommandPalette.test.tsx components/map/__tests__/MapEditor.test.tsx components/map/__tests__/MapEditorOutline.test.tsx` 成功。`npm run typecheck` 成功。

### RED で固定する振る舞い（結合）

入口表・opensDialog 表に対応するケースを優先する。

1. **起動ゲート:** ヘッダー「コマンド」（`operationControls` 先頭）と Ctrl/Cmd+K で開く。`editorShortcutsEnabled` 偽・editable・IME・`persistence.isConfirmOpen`・他ダイアログ open 中は **ヘッダーボタンの onOpen も**ショートカットも開かない。既 open なら再オープンしない。
2. **入口表（パレット open 時）:** `editorShortcutsEnabled === false`、ルート `inert`、履歴／ツリー編集／横断検索等の `use*Shortcut` 停止、`changeViewMode` 停止、`outlineActions.enabled` 偽。積から `commandPalette.screen === "closed"` だけを外すと当該テストが失敗する（実装後は戻す）。
3. **即時委譲（opensDialog=false）:** `edit.undo` / `view.outline` 等が既存コアに同期到達。`closeReason === "execute-immediate"`、`focusRequest === null`。表示切替後フォーカスは Task 4 列（本 Task のスパイで closeReason まで固定可）。
4. **opensDialog=true:** `edit.open-label-replace` ほか必須 5 ID。確認ダイアログを経由せず確定できない（L-688 対象）。連鎖後 `document.activeElement` は open 先内。`closeReason === "execute-dialog"`、直前要素へ戻らない。同一同期の閉→開のあいだに履歴ショートカットが発火しない（L-061）。
5. **実行経路:** パレット実行はボタン `disabled` を迂回してコアを呼ぶが、実行直前の `resolveCommandAvailability` が偽なら呼ばず live 拒否。閉じてから遅延実行しない。
6. **stale:** `mapId` / `documentRevision` 進行で `stale` 閉じ、§5.1 フォールバック列へフォーカス。
7. **通知:** 即時成功は閉じた後も残る `MapOperationNotice` 系統。拒否はパレット内 live（閉じると消える）のみ。
8. **L-015 / L-472:** 構造変更委譲は正本 `nodes`。兄弟順は配列/`parentId`。

### パレット open 時の入口表（L-061・テストで固定）

| 入口 | パレット open 時 |
| --- | --- |
| `editorShortcutsEnabled` 積 | 偽（`commandPalette.screen === "closed"` を積に含める） |
| ルートの `inert` | 付与（パレットはルート外） |
| `changeViewMode` | 積経由で停止 |
| `outlineActions` の `enabled` | 積経由で偽 |
| `useMapHistoryShortcuts` / `useCrossMapSearchShortcut` / 各 `use*Shortcut` | `enabled: editorShortcutsEnabled` で停止 |
| `mapId` / `documentRevision` 変化 | `stale` で自動 close |
| `persistence.isConfirmOpen` | 開かない（既存同時表示禁止） |
| 他ダイアログ open 中 | ヘッダー「コマンド」も Ctrl+K も開かない |
| `dialogMouseClickedAtRef` | パレット `onMouseClick` で更新 |
| ヘッダー「コマンド」/ Ctrl+K | 既 open なら再オープンしない。起動時は `editorShortcutsEnabled` ゲート |
| パレット → 他ダイアログ | 同一同期で閉→開。中間で shortcuts を真にしない |

### 必須 ID の opensDialog → closeReason（テスト対応表）

| opensDialog | 代表 ID | closeReason | focusRequest |
| --- | --- | --- | --- |
| false | `edit.undo`, `view.outline`, … | `execute-immediate` | `null`（表示切替は Task 4 列） |
| true | `edit.open-label-replace`, `edit.open-branch-move`, `edit.open-node-split`, `edit.open-node-merge`, `search.open-cross-map` | `execute-dialog` | `null`（open 先へ） |

### Interfaces

```ts
// MapEditor 内（公開モジュールに切り出す場合は client/src/components/map/commandPaletteExecution.ts）
export type CommandPaletteExecutionDeps = {
  closePalette: (reason: CommandPaletteCloseReason) => void;
  /**
   * 即時系: 実行直前に resolveCommandAvailability 再評価 → 可なら既存コアを同期呼び出し
   * （ヘッダーボタンの enabled ガード／disabled を迂回）→ close("execute-immediate")。
   * 閉じてから遅延実行しない。
   */
  runImmediate: (id: CommandId) => void;
  /**
   * opensDialog 系: close("execute-dialog") の直後に既存 open* を同一同期で呼ぶ。
   * 確定 API は呼ばない（L-688）。
   */
  openDialogCommand: (id: CommandId) => void;
};

// Dialog からの実行入口（親）
// onExecuteActive: () => {
//   const item = items[activeIndex];
//   if (!item) return;
//   if (!item.availability.enabled) { setReject(...); return; }
//   if (item.definition.opensDialog) openDialogCommand(item.definition.id);
//   else runImmediate(item.definition.id);
// }

// dismiss / stale フォーカス優先列（設計書 §5.1）— focusRequest.kind === "restore-opener" のときのみ
// (1) 開く直前要素（DOM 残存・無効でない・可視）
// (2) ヘッダー「コマンド」ボタン（CommandPaletteControl の buttonRef）
// (3) viewMode === "map" → canvasContainerRef
//     viewMode === "outline" → 選択行 → 先頭行 → ルート追加

// execute-immediate で表示切替した場合のフォーカスは Task 4（restore-opener しない）
```

`NodeSearchBox`: 既存のクエリ props は維持し、`inputRef?: RefObject<HTMLInputElement | null>` または同等で `search.focus-in-map` が focus できるようにする。

`AppHeader`: `operationControls` **先頭**に「コマンド」を置く（必須。確認や条件付きではない）。

---

## Task 4: アウトライン a11y・キャンバス aria-label・表示切替フォーカス列

**Files:**
- Modify: `client/src/components/outline/OutlineEditor.tsx`
  - 常設 `role="status"` `aria-live="polite"`（視覚は `sr-only`）。文言 `全{total}件中{index}件目、階層{depth}、{label}`（`getNodeDisplayLabel`）。同じ ID の再選択では文言を変えない。**空マップは更新しない**（status 文言を空のまま／初期のまま）。
  - Tab でツールバーへ到達できる現状を退行させない（行の tabindex 契約・ツールバー順を維持）。
  - 既存 ↑↓ に加え **Home/End** で先頭／末尾行へ移動・選択する契約を退行させない（現状維持の RED）。
- Modify: `client/src/components/map/MapStage.tsx` — キャンバスコンテナ（`tabIndex={-1}` の div）に `aria-label="マップキャンバス"`。`role="tree"` / `treeitem` は付けない。
- Modify: `client/src/components/map/MapEditor.tsx` — `changeViewMode("outline")` 成功後のフォーカス優先列 `(1) 選択行 (2) 先頭行 (3) ルート追加`。`changeViewMode("map")` 後は `canvasContainerRef` へ（既存 `returnToCanvas` / focus 契約と整合）。パレットからの表示切替（`execute-immediate`）も同じ列。
- Test: `client/src/components/outline/__tests__/OutlineEditor.test.tsx`（選択 live・同一 ID 不変・空ラベル表示名・**空マップは live 非更新**・**Home/End** を追加）
- Test: `client/src/components/map/__tests__/MapStage.test.tsx`（`aria-label="マップキャンバス"`。tree 役割が無いことを固定）
- Test: `client/src/components/map/__tests__/MapEditorOutline.test.tsx` または Task 3 の `MapEditorCommandPalette.test.tsx` に、表示切替後フォーカス列・アウトライン行から Tab でツールバー到達の回帰を追加
- Reuse: `client/src/domain/nodes/nodeDisplayLabel.ts` の `getNodeDisplayLabel`

- [x] **RED チェック:** 上記テスト追加後、`npm test -- --runInBand components/outline/__tests__/OutlineEditor.test.tsx components/map/__tests__/MapStage.test.tsx components/map/__tests__/MapEditorOutline.test.tsx components/map/__tests__/MapEditorCommandPalette.test.tsx` で RED を記録する。
- [x] **実装チェック:** live 領域・aria-label・切替後フォーカス列を実装。Alt 系キャンバスツリー編集ショートカットは新規割当も削除もしない（現状スナップショットのまま）。
- [x] **GREEN チェック:** 同じテスト全通過。既存 Outline ↑↓／Home／End／Enter・F2／編集中 Enter・Escape の契約が残ることを確認。`npm run typecheck` 成功。

### RED で固定する振る舞い

1. キーボードまたはクリックで選択が変わると live が更新される。同じ ID 再選択では DOM 文言が変わらない。
2. **空マップ**（rows 0）では live を更新しない。
3. ラベル空は `getNodeDisplayLabel` の表示名を使う。
4. キャンバスコンテナに `aria-label="マップキャンバス"`。フル ARIA tree なし。
5. アウトラインへ切替後フォーカスは選択行 → 先頭行 → ルート追加。マップへ切替後は `canvasContainerRef`。
6. アウトライン行フォーカスから **Home/End** で先頭／末尾へ移動できる（退行禁止）。
7. アウトライン行フォーカスから Tab で `aria-label="アウトライン操作"` ツールバーへ到達できる（退行禁止）。
8. パレット／既存表示切替のどちらからでもマップ↔アウトラインを移れる（パレット経路は `execute-immediate` 後に本 Task の列）。

### Interfaces

```ts
// OutlineEditor 内（コンポーネントローカルで可）
// selectionStatusText: string | null
// 更新条件: selectedNodeId が変わり、かつ model.rows に存在するときだけ（空マップは更新しない）
// テンプレート: `全${total}件中${index}件目、階層${depth}、${label}`
// index は 1-based（rows 配列上の位置）

// MapStage コンテナ
// <div ref={containerRef} tabIndex={-1} aria-label="マップキャンバス" …>

// 表示切替フォーカス列（changeViewMode 成功後・パレット execute-immediate 後も同じ）
// outline: (1) 選択行 (2) 先頭行 (3) ルート追加
// map: canvasContainerRef
```

アウトライン固有の構造変更ショートカットは今 Phase では増やさない。正はツールバー（Tab）とパレット。

---

## Task 5: ROADMAP 更新と `npm run verify`

**Files:**
- Modify: `ROADMAP.md`
  - Phase 22 見出しを完了表記へ
  - 候補020・候補021の 2 項目を `[x]`
  - 「現在地」に Phase 22 完了を追記（次の未完了は現行どおり Phase 20「名前付きスナップショット」候補014、および Phase 23 以降の未着手）
  - 「最終更新」を実装日（作業日）に更新
- Verify only（コード変更なし）: `client` でフル検証

- [x] **RED チェック:** 該当なし（ドキュメント＋統合検証）。実装前に Phase 22 が未チェックであることを確認する。
- [x] **実装チェック:** `ROADMAP.md` を上記どおり更新。実装していない項目は完了にしない。
- [x] **GREEN チェック:** `cd client && npm run verify` が成功する（`tailwind:scan`・`lint`・`typecheck`・`npm test -- --runInBand`・`build`）。回帰として既存の `useDialogFocusTrap`、`editableTarget`、`treeEditShortcutGuard`、Outline 移動／編集、Phase 21 閲覧ショートカット、CrossMap 検索ショートカット、Alt 系ショートカットの現状が落ちていないことを確認する。

### Interfaces

なし（ドキュメントと検証のみ）。Task 1–4 の公開 API を変えない。

---

## タスク依存関係

```
Task 1（カタログ・可否・ラベル・検索・shortcut 純関数）
  → Task 2（状態・Dialog・Control・shortcut hook）
    → Task 3（MapEditor 配線・連鎖・積・notice）
      → Task 4（Outline live・MapStage aria・切替フォーカス）
        → Task 5（ROADMAP + verify）
```

Task 4 の一部（MapStage aria-label 単体）は Task 3 とファイル競合が少ないが、`changeViewMode` フォーカス列は MapEditor を触るため Task 3 完了後に行う。

---

## 完了の定義

1. 必須コマンド ID のみが第1版カタログにあり、パレットから既存コアへ同期委譲できる（破壊的操作は `open*` のみ）。
2. Ctrl/Cmd+K とヘッダー「コマンド」（`operationControls` 先頭）で開き、L-061 入口表を満たす。閉じるボタン・Escape・オーバーレイで `dismiss`。
3. 即時成功は `execute-immediate`（focusRequest なし）、ダイアログ系は `execute-dialog`、dismiss/stale は restore-opener。
4. アウトライン選択 live（空マップ非更新）とキャンバス `aria-label="マップキャンバス"` があり、Home/End・Tab ツールバー到達が退行していない。
5. `ROADMAP.md` Phase 22 の 2 項目が完了し、`npm run verify` 成功。
6. 本プラン実行中にコミットしていない。
