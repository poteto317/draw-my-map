# Phase 36（090/091/092）: 音声・タブレット・モバイル Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development. 作業場所: メインのチェックアウトのブランチ `feat/phase36-voice-tablet-mobile`（worktree 不使用）。**Do not commit** during `/feature`.

**Goal:** Web Speech で確定テキストを `insertForest` 1 Undo のノードにし（090）、タッチのヒット拡大・長押しコンテキスト（091）、狭幅アウトライン優先（092）を 1 PR で届ける。

**Architecture:** セッション状態 `listening` / `interimTranscript` / `userChoseMapOnNarrow` / `isNarrowViewport`（文書に保存しない）。ノード追加は既存 `insertForest`。タッチは既存 `touchGestureCoordinator` を正本（拡張最小）。狭幅は `NARROW_VIEWPORT_MAX_PX = 767`。`listening` は Phase35 `learningActive` と同型で `editorShortcutsEnabled`・`inert` に積む。

**Tech Stack:** React, TypeScript, Jest, Web Speech API（モック）, matchMedia, 既存 Pixi pointer / commandCatalog

## Global Constraints

- 設計: `docs/superpowers/specs/2026-11-26-phase36-voice-tablet-mobile-design.md`
- V3 新フィールドなし（L-825）。見送りはかんばん #60–#63
- L-061 inventory 必須（E 行含む）。`listening` 中は編集系を塞ぐ
- 子／ルート追加は **単一 `insertForest`**（`addChildNode`+label 禁止）。成否は `VoiceNodeAddOutcome`（L-001）
- トグル ON 中のみ自動再 `start`。再開始（既に ON）は no-op。排他入室で即停止
- 狭幅ヘッダーは横スクロールのみ。タッチ coordinator 本体は拡張せずテスト固定
- TDD。コミットしない。日本語 UI。最終 `cd client && npm run verify`
- 知見: L-001, L-048, L-060, L-061, L-166, L-408, L-522, L-1211, L-825
- ROADMAP 090–092 完了更新

## File Map

| 領域 | 主なファイル |
|------|----------------|
| inventory | `docs/superpowers/specs/2026-11-26-phase36-voice-tablet-mobile-inventory.md` |
| 音声ガード | Create `client/src/domain/map/mapVoiceGuards.ts`（`mapLearnGuards` 同型） |
| 狭幅 | Create `client/src/domain/view/narrowViewport.ts`、`client/src/hooks/useNarrowViewport.ts` |
| 音声アダプタ | Create `client/src/domain/voice/speechRecognitionAdapter.ts` + tests |
| 音声 hook | Create `client/src/hooks/useVoiceInput.ts` + tests（`insertForest` 呼び出し。**useNodes は原則触らない**） |
| コマンド | `commandTypes.ts` / `commandCatalog.ts` / `buildCommandAvailabilityContext.ts` / `resolveCommandAvailability.ts` / palette dispatch / `commandCatalog.test.ts` |
| タッチ | `stageInteractions` / hit test / long-press（Pixi）+ tests |
| 狭幅 viewMode | `MapEditor.tsx` の既存 `viewMode` / `changeViewMode` / `applyViewMode` に hook を配線 |
| ヘッダー UI | `AppHeader` / Create `VoiceInputControl.tsx` |
| docs | features / overview / browser-test-cases / ROADMAP |

## Review Focus

1. `listening` 中に構造編集・ショートカットが動かない
2. 確定追加が常に 1 Undo
3. 狭幅既定と `userChoseMapOnNarrow` のリセット契機
4. タッチ長押しとピンチの競合なし
5. 未対応ブラウザで成功扱いにしない

---

### Task 0: L-061 inventory

**Files:** Create `docs/superpowers/specs/2026-11-26-phase36-voice-tablet-mobile-inventory.md`

- Phase 35 inventory を参照し同型。設計 §6 の V/T/M/E を網羅
- §0: `listening` と `editorShortcutsEnabled` / `inert` の積、学習・プレゼンとの相互
- **E 行ごとのテスト所有者表**を inventory 内に必須（例: E→`mapVoiceGuards` + MapEditor 結合＝Task1）

- [x] inventory 作成（所有者表込み）

---

### Task 1: 音声（090）

**Files:**
- Create: `client/src/domain/map/mapVoiceGuards.ts`（開始拒否・listening 中編集拒否の共通先頭。操作ごとコピー禁止）
- Create: `speechRecognitionAdapter.ts`（差し替え可能。ブラウザ無い環境は factory が null。**`lang: "ja-JP"`**）
- Create: `useVoiceInput.ts`（状態機械・自動再 start・排他停止・interim・**MapEditor から渡した `insertForest` を呼ぶ**。useNodes は原則触らない）
- Create: `VoiceInputControl.tsx`（ヘッダートグル。Enter/Space の `event.repeat` 抑止＝L-408）
- Modify: `MapEditor.tsx`（`editorShortcutsEnabled` に `!listening`、**`inert` に learningActive 例外を listening へコピーしない**、outline `enabled` に listening を OR しない）
- Modify: `commandTypes.ts` / `commandCatalog.ts` / `buildCommandAvailabilityContext.ts` / `resolveCommandAvailability.ts` / palette dispatch（learn 系と同型。`MUTATING_IDS` を listening 中無効）
- Modify: `AppHeader` 配線、`commandCatalog.test.ts` に ID 追記
- Tests: adapter mock、hook、MapEditor 結合、guards
- 確定テキストは **正規化**後に `insertForest`。失敗 notice は **`formatOutlineInsertFailure`**（独自文言を増やさない）
- 成功後: `rootId` を選択＋マップ表示時は既存フォーカスで中央寄せ

**Interfaces:**
```ts
import type { InsertForestResult } from "…"; // 正本
type VoiceNodeAddOutcome = InsertForestResult;
// 成功時の選択は result.rootId（nodeId 識別子は使わない）

// context 拡張例: voiceListening, canVoiceInputStart, canVoiceInputStop, voiceStartDisabledReason
// continuous:false + トグルON中は final ごとに insertForest → 自動 re-start
// 再 start（既 listening）: no-op（通知なし）

// L-060 必須 props（省略不可）:
// voiceListening, interimTranscript, onVoiceToggle,
// isNarrowViewport, userChoseMapOnNarrow, dialogMouseClickedAtRef
```

- [x] RED/GREEN: 未対応ブラウザ拒否（L-001）
- [x] RED/GREEN: inventory 代表の開始拒否（保護・競合・学習・再生・ダイアログ／パレット・関連線／グループ）＋日本語 reason（`mapVoiceGuards`）
- [x] RED/GREEN: 排他入室で即停止・停止通知・以降の final はノード化しない
- [x] RED/GREEN: 子／ルート insertForest 各 1 Undo、空 final スキップ、エラー時 listening OFF、再 start no-op
- [x] RED/GREEN: ラベル正規化・`ja-JP` 初期化
- [x] RED/GREEN: 追加後の選択（`rootId`）／マップ中央寄せ；開始拒否通過後の確定時フォールバックは `kind: "root"`（失敗 reason で後続 start しない）
- [x] RED/GREEN: listening 中 `editorShortcutsEnabled` / **inert 維持（learningActive 例外なし）** / outline・map キー無効・構造編集不可（L-522/L-1211）
- [x] RED/GREEN: 必須 props 未配線で RED（L-060）；L-166 クリア（OFF / mapId / **documentRevision** / 破棄；`useRevisionScopedNotice`）
- [x] RED/GREEN: パレット start/stop とトグル同期；アウトラインでも音声可；トグルの repeat Enter/Space 抑止（L-408）
- [x] RED/GREEN: `commandCatalog.test.ts` に voice ID；availability context の listening ブロック

---

### Task 2: タブレット（091）

**Files:**
- Modify: ノードヒット（`pointerType === "touch"` 時パディング 8–12）
- Modify: 長押し（450–550ms）→ 既存コンテキストメニュー。マウス右クリック不変
- Tests: touchGestureCoordinator 契約（2 本指中は単指コンテキスト開始しない）、long-press、hit padding、**`dialogMouseClickedAtRef` 経由の閉鎖直後タッチ無視**（L-060/L-408 同型）
- **coordinator 本体は拡張しない**（設計 §4.3）

- [x] RED/GREEN: タッチのみヒット拡大
- [x] RED/GREEN: 長押しでメニュー／移動超過でパン
- [x] RED/GREEN: ピンチ中にコンテキストが開かない
- [x] RED/GREEN: ダイアログ閉鎖直後のタッチ pointer 無視

---

### Task 3: スマホ狭幅（092）

**Files:**
- Create: `client/src/domain/view/narrowViewport.ts`（`NARROW_VIEWPORT_MAX_PX = 767`）
- Create: `client/src/hooks/useNarrowViewport.ts`（matchMedia 購読、`userChoseMapOnNarrow`）
- Modify: `MapEditor.tsx` の既存 `viewMode` / `changeViewMode` / `applyViewMode` に配線（設計 §5.2）。view.map / view.outline コマンドと整合（L-048）
- Modify: 狭幅ヘッダー横スクロール（表示モード・音声・保存状態が先頭付近）
- Tests: matchMedia モック。`userChoseMapOnNarrow` リセットは設計 §5.2 どおり **mapId 再マウント**と**保護モード等での編集画面再構築**

- [x] RED/GREEN: 狭幅で outline 既定
- [x] RED/GREEN: ユーザーがマップ選択後は狭幅復帰でも上書きしない
- [x] RED/GREEN: 狭→広で強制マップ復帰しない（outline 維持）
- [x] RED/GREEN: mapId 変更／保護モード再構築でフラグリセット

---

### Task 4: 仕様・ROADMAP・browser-test

**Files:**
- Modify: `docs/specifications/features.md`、`docs/architecture/overview.md`（必要最小）
- Modify: `docs/testing/browser-test-cases.md`（音声・タッチ・狭幅の節。手動未実施可）
- Modify: `ROADMAP.md`（090–092 [x]、現在地、最終更新）
- `cd client && npm run verify`

- [x] docs / ROADMAP
- [x] verify GREEN

---

## 実行ノート

- ブランチ: `feat/phase36-voice-tablet-mobile`
- サブエージェントは Task 単位・逐次。各 Task 後に仕様適合＋品質の二段階レビュー
- `/feature` 中はコミットしない
