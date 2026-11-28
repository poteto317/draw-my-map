# 下部 Dock 風メニューと項目カスタマイズ — 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking. このリポジトリではインライン実行禁止（AGENTS.md）。コミットしない。

**Goal:** 操作ボタン群を下部 Dock へ移し、表示／並びを `ui-prefs.v1` でカスタマイズ可能にする。長い説明文言は `/help` へ移す。

**Architecture:** domain のスロット catalog + `resolveDockSlots` + `UiPrefsV1.dockLayout`。UI は薄い `AppHeader` + `EditorDock` + `DockCustomizeDialog` + `/help`。MapEditor は ID→control 配線と縦 flex。

**Tech Stack:** Next.js App Router, React, Jest/jsdom, 既存 `ui-prefs`

**設計:** `docs/superpowers/specs/2026-11-28-bottom-dock-menu-design.md`

## Global Constraints

- 見送り: #88（モバイル専用 UI）
- スロット ID・既定 visible・アウトライン非マウント規則は設計「決めたこと」3・4・10 が正本
- `/help` リンクは上部バーのみ。operationNotices は上部バー直下
- L-002 空 prefs / L-058 disabled / L-060 必須 props / L-061 §6 表 / L-408 / L-522 / L-166（新規 notice なし）/ L-792 祖先セレクタ
- TDD。日本語 UI。最終 `cd client && npm run verify`
- ROADMAP は新 Phase なし。「現在地」1 行 + features / browser-test 更新

## File Map

| 領域 | 主なファイル |
|------|----------------|
| domain dock | Create `client/src/domain/dock/*`（catalog, resolve, default layout） |
| ui prefs | Modify `uiPrefsModel.ts`, storage, `useUiPrefs` |
| Dock UI | Create `EditorDock.tsx`, `DockCustomizeDialog.tsx`, tests |
| Header | Modify `AppHeader.tsx`（operations 段削除、使い方リンク、notices 行） |
| MapEditor | Modify layout flex、スロット配線、ヒント／コピー文削除 |
| help | Create `client/src/app/help/page.tsx`（+ 本文コンポーネント） |
| collapse | Modify `NodeCollapseControl`（常時説明文削除） |
| docs | ROADMAP, features.md, browser-test-cases.md |

## Review Focus

1. 既定非表示が「その他」に勝手に出ない
2. アウトラインでマップ専用が DOM に残らない
3. prefs 空／未知 ID で既定に戻る
4. カスタマイズ表示ゼロで適用できない
5. L-408 / L-060 / L-522 のテストがある
6. `/help` に (a)(b)(c)、編集画面に常時テキストが無い

---

### Task 0: dock domain（catalog + resolve + prefs）

**Files:**
- Create `client/src/domain/dock/dockSlotCatalog.ts`
- Create `client/src/domain/dock/resolveDockSlots.ts`
- Create `client/src/domain/dock/defaultDockLayout.ts`
- Modify `client/src/domain/uiPrefs/uiPrefsModel.ts`（`dockLayout?`）
- Modify normalize／storage 読込（既存 uiPrefs 経路）
- Tests: `dockSlotCatalog.test.ts`, `resolveDockSlots.test.ts`, `uiPrefsModel` dock 系

**Interfaces:**
```ts
type DockSlotId = string; // 設計の閉じた ID リテラル union 推奨
type DockSlotDef = {
  id: DockSlotId;
  label: string;
  group: "edit" | "view-tools" | "session" | "voice" | "io" | "collab-share";
  defaultVisible: boolean;
  outlineVisible: boolean;
  requiresMapView: boolean;
};

function listDockSlotDefs(): readonly DockSlotDef[];
function createDefaultDockVisibleSlotIds(): DockSlotId[];
function createDefaultDockLayout(): { visibleSlotIds: DockSlotId[] };
function normalizeDockVisibleSlotIds(ids: unknown): DockSlotId[]; // 空・不正→既定
function normalizeDockLayout(raw: unknown): { visibleSlotIds: DockSlotId[] };

type ResolveDockSlotsInput = {
  visibleSlotIds: readonly DockSlotId[];
  viewMode: "map" | "outline";
};
/** outline 時は outlineVisible===false または requiresMapView===true を除外 */
function resolveDockSlots(input: ResolveDockSlotsInput): DockSlotId[];
```

- [x] RED: 設計決めたこと 3 の **全スロット ID が catalog に登録**されていること（網羅）、既定 ID 順、未知除去、空→既定、outline で `outlineVisible===false` **または** `requiresMapView` を除外
- [x] GREEN: 実装
- [x] prefs 読込で `dockLayout` 欠落時 `createDefaultDockLayout()`
- [x] 保存経路で空 `visibleSlotIds` を書かない（書いたら normalize で既定。往復テスト）

---

### Task 1: EditorDock + DockCustomizeDialog

**Files:**
- Create `client/src/components/layout/EditorDock.tsx`
- Create `client/src/components/layout/DockCustomizeDialog.tsx`
- Tests（必須 props・L-408・表示ゼロで適用 disabled・並び上下）

**Interfaces:**
```ts
// EditorDock: slots: { id, node }[], onCustomize, customizeButtonRef, isNarrowViewport
// DockCustomizeDialog: 設計 §7.2 の必須 props
```

- [x] RED → GREEN: 必須 props、L-408（repeat / detail>1）、表示ゼロで適用 disabled、並び上下
- [x] はみ出し表示スロットのみ「その他」へ（既定非表示は出ない）。幅を狭めたテストまたは計測モック
- [x] 「既定に戻す」で下書きが既定 ID に、「キャンセル」で破棄（適用前の visible 不変）
- [x] グループ見出しが表示される
- [x] 閉じた後フォーカスがカスタマイズボタンへ戻る
- [x] 保存失敗時はダイアログ内インラインエラーのみ（`operationNotices` を増やさない。L-166）
- [x] testid `editor-dock` / カスタマイズダイアログ
- [x] CSS は `.editor-dock` 祖先付き（L-792）

---

### Task 2: AppHeader 薄型化 + 使い方リンク + notices

**Files:**
- Modify `AppHeader.tsx`（`header-operations-scroll` 削除、help リンク、notices を primary 次行へ）
- Update `AppHeader` 関連テスト

- [x] RED: operations 段が無い、使い方リンク 1（同一タブ・`target="_blank"` 禁止）、hints 常時無し
- [x] RED: 決めたこと 2 の上部残置（ブランド・mapControls・保存・表示切替・検索・配置・レイアウト系）が primary に残る
- [x] `operationNotices` のクリア契機は移設前後で不変（L-166。既存テストが通ること／代表ケース固定）
- [x] GREEN

---

### Task 3: MapEditor 配線 + 文言削除 + flex

**Files:**
- Modify `MapEditor.tsx`（縦 flex、Dock マウント、スロット表、operationControls をヘッダーから外す）
- Modify `NodeCollapseControl.tsx`（常時説明削除）
- コピー案内定数の画面表示削除（`/help` へ移す）
- `LayoutModeOperationHint` をヘッダーから外す
- 既存 MapEditor／ヘッダー依存テスト更新
- L-522: Dock フォーカス時 Delete 非発火（既存ショートカット制御への Dock 含めを確認）

- [x] RED → GREEN（代表: Undo・コマンドが dock、アウトラインで wheelZoom 等非マウント）
- [x] MapEditor 組み立て（L-060）: `uiPrefs` / dock 更新 / スロット表 / `DockCustomizeDialog` へ `dialogMouseClickedAtRef`（L-408）が必須配線。外し変異で失敗
- [x] 狭幅でも `voiceInput` が primary に出ず Dock（またはその他）のみ（決めたこと 9）
- [x] カスタマイズ適用 → リロード（prefs 再読込）後も visible／並びが復元（受け入れ 3）
- [x] §6 表: learning 付随ボタンは learnMode 内のみ
- [x] L-058: マップ表示中、既存理由で押せない操作は実 `disabled`（見た目だけ無効にしない）
- [x] L-522: Dock フォーカス時 Delete 非発火 **かつ** コマンド入口上で Ctrl/Cmd+K が有効

---

### Task 4: `/help` ページ

**Files:**
- Create `client/src/app/help/page.tsx`（および本文）
- Tests: (a)(b)(c) 見出し
- `.help-page` 祖先セレクタ

- [x] RED → GREEN

---

### Task 5: docs + ROADMAP

**Files:**
- Modify `docs/specifications/features.md`
- Modify `docs/testing/browser-test-cases.md`（短節）
- Modify `ROADMAP.md`（現在地 1 行。新 Phase なし）

- [x] レイアウト図が薄いバー + Dock + `/help` を反映
- [x] 操作ヒント「常時ヘッダー」記述を削除／help 参照に変更

---

### Task 6: verify

- [x] `cd client && npm run verify`
- [x] 失敗したら修正して再実行
