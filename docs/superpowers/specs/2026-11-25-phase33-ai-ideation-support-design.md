# Phase 33（078–081）: AIによる発想・整理支援 — 設計

対象カード: [スクラム #38](https://scrum-board-jkcejsb6ka-an.a.run.app/items/38?project=5)  
ROADMAP: 候補078「子ノードの候補提案」、079「分類・並べ替えの提案」、080「重複・類似項目の検出」、081「不足する観点の提案」

**今回の範囲外（非目標・実装しない）**: 候補082 文章構造化、083 イラスト画風統一、084 根拠付き Q&A（後続 PR）。

## 決めたこと

### ユーザーが決めたこと（推奨採用）

1. **範囲**: 候補 **078–081** を **1 PR**。082–084 は実装も入口も足さない。
2. **適用の形**: Phase 32 と同じく **提案 → 差分プレビュー → 採否 → 採用分だけ 1 回の Undo**。構造変更（子追加・並べ替え／付け替え・統合候補）も同じ流儀。
3. **安全策**: 採用時に最新状態で再照合。1 件でも古い／ロック／対象欠落なら **全体不適用**（部分適用なし。L-063）。保護・競合・外部削除中は入口無効。
4. **AI 提供元**: Phase 32 と同じ（Claude / OpenAI、サーバー env、既定 Claude、キー無しは無効、フェイク generator 注入）。

### 設計で決めたこと（推奨）

5. **基盤の再利用**: `client/src/domain/aiAssist/`・`server/aiAssist/`・`/api/ai-assist/*`・差分プレビュー UI を拡張する。提供元選択・Origin 検査・プロンプト無害化・構造化出力は Phase 32 を踏襲（L-017・L-044・L-635・L-752）。
6. **4 課題と入口**（いずれも選択ノード 1 件が根。複数選択は無効）:

| 候補 | 入口ラベル（案） | 提案の種類 | 適用結果 |
|------|------------------|------------|----------|
| 078 | 子の候補を提案… | `add-child`（ラベル案） | 選んだノード直下に子を追加（採択した件数分） |
| 079 | 分類・並べ替えを提案… | `reparent` / `reorder-siblings` | 親の付け替えまたは兄弟順の変更 |
| 080 | 重複・類似を検出… | `merge-pair`（主・従の ID） | 既存の統合（merge）経路で 1 組ずつ採否。採用分はまとめて 1 Undo |
| 081 | 不足観点を提案… | `add-child` または `add-sibling`（観点ラベル） | 子／兄弟ノードの追加 |

7. **送信範囲**: Phase 32 と同型の枝入力（`buildAiBranchInput`）。課題ごとの `maxNodes`: 078/081 **80**、079 **100**、080 **120**。合計文字 **40,000**、ラベル 200・メモ 500 抜粋。超過は送信せず案内（黙って一部送らない）。
8. **送信前確認**: 毎回ダイアログ先頭で提供元・モデル・送るもの／送らないものを示し、「送信して提案を作る」でのみ API 呼び出し。永続同意なし。
9. **構造提案の検証**:
   - `add-child` / `add-sibling`: ラベルは前後空白除去後 1〜80 文字、制御文字除去。親 ID は送った枝内（sibling は根またはその子の親として妥当）。件数上限 **20** 件／応答。
   - `reparent`: 対象・新親は枝内 ID、循環禁止、ロック対象は提案から除外。
   - `reorder-siblings`: 同一親の下の ID 順列が枝内のその親の子集合と一致（過不足なし）。
   - `merge-pair`: 両 ID が枝内・異なり・いずれもロックでない。既存 `planNodeMerge` が通る組だけ提案に残す（通らない組は捨てる／全体 invalid は「1 組も残らないとき」）。
10. **古さ（stale）**:
    - マップ ID / `documentRevision` がダイアログ開始時と違えば全体古い。
    - `add-*`: 親（または sibling 基準）が無い・ロック、または入力指紋（枝）が baseline と違う。
    - `reparent` / `reorder`: 関係するノードの親子・兄弟順・ラベル指紋が baseline と違う、またはロック。
    - `merge-pair`: 両ノードのラベル／親子が baseline と違う、またはロック、または統合不可。
11. **適用の Undo**: 採用分は `useNodes` の新 API（仮称 `applyAiStructureProposals`）が最新状態で再照合し、**1 回の文書変更**（構造は `applyTreeChange` / 既存 merge 経路）に載せる。成功時だけ通知（L-001）。空適用は Undo を積まない。
12. **UI**: 右パネル「AI支援」節に 4 ボタンを追加（Phase 32 の 2 件の下）。コマンドパレットに 4 件（`edit.open-ai-child-candidates` 等）。新ショートカットなし。ダイアログ中は根 `inert`（既存積）。
13. **保存**: 提案・採否は保存しない。適用結果のみ通常のノード／親子として V3 文書に残る。
14. **知見**: L-061（入口 inventory）、L-001、L-036/037/588（stale）、L-063（部分適用禁止）、L-203（docs 同期）、L-825（ノード任意属性を増やさない）、L-1133（適用成功後だけ状態更新）。

## 1. 目的と境界

### 1.1 目的

選んだ枝について、AI に「次の子」「分類／並べ替え」「重複」「不足観点」を提案させ、利用者が一件ずつ確認してから構造を変える。

### 1.2 境界

- **しない**: 082–084、ラベル一括リネーム、自動適用、提案の永続化、新ショートカット、公開 API の認証強化（Phase 32 と同じローカル前提。docs に注意を書く）。
- **変えるもの**: ノードの追加、親子関係、兄弟順、既存統合 API によるマージ。重要度・メモは Phase 32 のまま（本 PR では触らない）。

## 2. 既存実装との接点

| 既存 | 使い方 |
|------|--------|
| Phase 32 `aiAssist*` / `aiProposal` / 差分プレビュー | 課題追加・`AiProposal` の kind 拡張・共通ダイアログ |
| `addChildNode` / 兄弟追加 / `applyTreeChange` | 子・兄弟追加の確定 |
| `planNodeMerge` / merge ダイアログ流儀 | 080 の統合。プレビューは AI ダイアログ側、確定は merge 計画の再実行 |
| `nodeEditLock` / protect / conflict | 入口と採用時ガード |
| `COMMAND_CATALOG` | 4 コマンド追加 |

## 3. ドメイン拡張

### 3.0 inventory（L-061・必須）

実装 Task 0 で `docs/superpowers/specs/2026-11-25-phase33-ai-ideation-support-inventory.md` を作る。Phase 28–32 同型の入口表。列: 入口 × 保護 × 競合 × 関連線選択 × グループ選択 × ラベル編集（マップ／アウトライン）× 再生中 × アウトライン表示。行に N1–N4（4 AI 入口）・パレット 4 件・適用ボタン・既存構造編集との交差を含める。テスト所有者: 入口＝UI タスク、適用・stale＝domain／hook タスク。

### 3.1 枝入力オプション（課題別）

| 課題 | maxNodes | includeRootNote | 備考 |
|------|----------|-----------------|------|
| 078 | 80 | true | 根の文脈が子提案に必要 |
| 079 | 100 | true | 分類にラベル・メモが必要 |
| 080 | 120 | true | 類似判定に文脈が必要 |
| 081 | 80 | true | 観点不足の判定に根＋子孫 |

指紋・送信・サーバー検証は **同一オプション** で `buildAiBranchInput` する（L-018）。

### 3.2 入口可否（`resolveAiAssistEntryAvailability` 拡張）

共通前提（どれかで不可）: AI 未設定、保護、競合、外部削除、複数選択、再生中、関連線／グループ選択中、根ノード欠落。

| 課題 | 追加条件 |
|------|----------|
| 078 | 根がロックなら不可（子は追加できるがロック根への追加を拒否する既存規則に合わせる）。子孫 0 でも可 |
| 079 | 枝内ノードが **2 以上**（並べ替え・付け替えの意味がある）。根ロックでも、ロックされていない子孫があれば可（ロック対象の提案は検証で落とす） |
| 080 | 枝内 **非ロックノードが 2 以上** |
| 081 | 078 と同型（根ロック不可、子孫 0 でも可） |

### 3.3 構造化出力スキーマ（要約）

各応答は **単一課題のみ**（kind 混在なし）。079 は `moves` 配列内で `type: "reparent" | "reorder"` を区別。

```ts
// 078 POST body 応答（検証後）
{ candidates: { label: string }[] }  // 1〜20。parent は常に送信 rootId

// 081
{ items: { label: string; placement: "child" | "sibling" }[] }  // 1〜20。sibling の親は root の parent（root が森の根なら sibling 不可→その件は検証で除外）

// 079
{ moves: (
  | { type: "reparent"; nodeId: number; newParentId: number }
  | { type: "reorder"; parentId: number; childIds: number[] }
)[] }  // 1〜30。reorder の childIds はその親の子集合の順列

// 080
{ pairs: { primaryId: number; secondaryId: number; reason: string }[] }  // 1〜20。reason は表示用≤30
```

クライアント／サーバーとも同じ `validate*Output`。1 件も残らなければ `invalid-output`（080 で planNodeMerge 不通の組を除いた結果が 0 のときも同じ）。

### 3.4 `AiProposal` kind と baseline／key

| kind | key | baseline | 表示 |
|------|-----|----------|------|
| `add-child` | `add-child:${parentId}:${label}` | `{ parentId, inputFingerprint }` | 親ラベル ← +子ラベル |
| `add-sibling` | `add-sibling:${anchorId}:${label}` | `{ anchorId, parentId, inputFingerprint }` | 基準ラベルの兄弟として +label。挿入は **基準の直後**（末尾ではない） |
| `reparent` | `reparent:${nodeId}:${newParentId}` | `{ nodeId, oldParentId, label, inputFingerprint }` | 旧親 → 新親 |
| `reorder-siblings` | `reorder:${parentId}:${childIds.join(",")}` | `{ parentId, childIdsBefore: number[], inputFingerprint }` | 兄弟順の変更。比較は **同一 parentId の子の nodes 配列順**（既存並べ替えドメインと同じ） |
| `merge-pair` | `merge:${primaryId}:${secondaryId}` | `{ primaryId, secondaryId, primaryLabel, secondaryLabel, parentId, inputFingerprint }` | 統合プレビュー。確定時は `planNodeMerge` を **最新状態で再実行**し `isSameNodeMergePlan` 相当（ID 組＋主ID）で照合 |

ラベル指紋は **抜粋前の全文**（Phase 32 importance と同型）。

### 3.5 一括適用（`applyAiStructureProposals`）

1. 採用リストを固定順でソート: **`merge-pair` → `reparent` → `reorder-siblings` → `add-child` / `add-sibling`**（統合・付け替えを先に行い、追加は最後。同一 kind 内は提案配列順）。
2. 全件の stale 判定。1 件でも古い → `{ ok: false, reason: "stale", staleKeys }` で **何も変えない**。
3. 作業用の `NodeMapState` コピー上で順に計画:
   - merge: `planNodeMerge`（joiner は既存既定、`visibleNodeIds` は現在の表示集合）。失敗 → 全体 `placement-failed`（部分コミットなし）。
   - reparent / reorder: 既存の移動・並べ替えドメイン。失敗 → 全体 `placement-failed`。
   - add-*: 新 ID は適用開始時にまとめて採番（`nextId` を連続消費）。失敗 → 全体 `placement-failed`。
4. すべて成功したら **1 回** `applyStateChange`（merge を含むため tree 専用経路に限らない）。値が変わらなければ `nothing-to-apply`。
5. 成否は `AiStructureApplyOutcome` で返し、成功時だけ UI 通知（L-001）。UI 状態更新は適用成功後のみ（L-1133）。

080 の属性統合警告: プレビューに「ラベル以外の属性は既存の統合規則に従う」と一文出す。詳細な属性差分 UI は既存 merge ダイアログを開かない（AI ダイアログ内の簡易表示）。

### 3.6 081 `add-sibling` 詳細

- 出力: `{ label, placement: "sibling" }`。基準（anchor）は **送信 rootId**。
- root に親が無い（森の根）ならその件は検証で除外。除外後 0 件なら invalid-output。
- 適用時の挿入位置: 同一親の子リストで **anchor の直後**。

## 4. サーバー

| 経路 | 課題 |
|------|------|
| `POST /api/ai-assist/child-candidates` | 078 |
| `POST /api/ai-assist/classify-reorder` | 079 |
| `POST /api/ai-assist/duplicates` | 080 |
| `POST /api/ai-assist/missing-perspectives` | 081 |

既存 `handleAiAssistRequest` + `aiAssistTasks` にタスク定義を足す。`GET /api/ai-assist/status` は変更なし。

## 5. UI／状態・hook 境界

- **方式（固定）**: Phase 32 の AI 支援ダイアログを **課題種別（`AiAssistKind`）で分岐**して再利用する。screen の積は増やさず、開くときに kind を渡す。
- **`useAiAssistDialog`**: `send` が kind に応じて 4 POST のいずれかを呼ぶ。返却する入口可否は `childEntry` / `classifyEntry` / `duplicatesEntry` / `perspectivesEntry`（既存の summary／importance も維持）。適用は kind が構造系なら `applyAiStructureProposals`、属性系は既存 `applyAiProposals`。
- **`useNodes`**: `applyAiStructureProposals` を公開。`isNodeOpBlocked` 時は domain 成功でも `rejected`（Phase 32 同型）。確定直前に blockers 再チェックし、文言は `aiApplyBlockedMessage`（既存または拡張）。
- **関連線／グループ選択**: 入口の「不可」判定の正本は **`nodeOpsBlockedByCanvasSelection`（または同等）＋ `resolveAiAssistEntryAvailability`**。右パネルは選択種で AI 節を隠す／無効にし、パレットは `CommandAvailabilityContext` で同じ不可理由を出す（L-057/L-058。値は一箇所から合成）。
- 生成中は多重送信禁止・取消・マップ切替／revision 変化で中断（Phase 32 同型）。
- 既定採否は未決。未決は適用しない。「すべて採用」は置かない。

### 5.1 `AiStructureApplyOutcome`（L-001）

```ts
| { ok: true; appliedCount: number }
| { ok: false; reason: "stale"; staleKeys: string[] }
| { ok: false; reason: "nothing-to-apply" | "placement-failed" | "rejected" }
```

`rejected` = ドメインは成功したが `applyStateChange` が false（ブロック等）。UI は成功時のみトースト。

## 6. L-203 同期先

- `docs/specifications/features.md`（Phase 33 節・078–081）
- `docs/specifications/api.md`（4 POST の章）
- `docs/specifications/data-model.md`（提案は保存しない・構造変更のみ文書に残る）
- `docs/architecture/overview.md`（Phase 33）
- `ROADMAP.md`（078–081 `[x]`、082–084 は未完了、現在地・最終更新）
- `docs/testing/browser-test-cases.md`（AI 支援の追加節。実ブラウザ未実施なら未確認と明記）
- 公開 hook／domain の型コメント、必要なら `docs/ai-assist-setup.md` に 4 課題を追記

## 7. 実装順（概要）

1. Task0 inventory  
2. 出力検証・定数・入口可否  
3. `AiProposal` 拡張・stale・`applyAiStructureProposals`  
4. サーバー 4 ルート＋タスク定義  
5. client（`aiAssistClient`・hook・ダイアログ分岐・MapEditor／パレット配線）  
6. docs / ROADMAP / `npm run verify`

## 8. 検証の観点

- 各課題: 送信前確認 → フェイク生成 → プレビュー → 採否 → 適用 → Undo 1 回。
- stale: 適用前に枝を変えると全体不適用。
- 保護・競合・複数選択・ロック・再生中・関連線／グループ選択で入口無効。
- `rejected` / `placement-failed` の通知。
- 不正 JSON／上限超過／空提案／081 根のみで sibling 除外。
- 082–084 の入口が無いこと。
- L-203: §6 の同期先。

## 9. 知見 ID（実装時参照）

L-061, L-001, L-017, L-036, L-037, L-044, L-057, L-058, L-063, L-203, L-213, L-588, L-635, L-752, L-825, L-1133
