# 複数タブの編集競合検出（候補008）設計

作成日: 2026-11-11。対象: Phase 16 の候補008。状態: 実装前の設計判断（ユーザー承認済みとは扱わない）。

## 1. 目的と境界

同一ブラウザの複数タブで Draw My Map を開いているとき、別タブでのマップ更新・削除によって、現在のタブの未保存データが黙って上書きされたり、逆に別タブで行われた最新の変更を現在のタブの古いメモリ状態で上書きしてしまうデータ消失事故を防止する。

成功表示・保存完了の判定は、ストレージ上の完全性と整合性が確認できたときだけ行う。不一致、別タブでの変更、削除を検知した場合は自動保存を即座にブロックし、競合ガード状態（自動保存・flush 抑止）および明示的な解決 UI（別名保存・リロード・JSON救出）によってデータを破壊から守る。

### 対象外（YAGNI の徹底）
- 複数端末・複数ブラウザ間でのリアルタイム同期・共同編集（CRDT / OT / WebSocket 等）。
- 異なるオリジン間での通信。
- **現在開いていない他のマップのリアルタイム同期や名前変更の追従**（候補008 は開いているマップの競合検出とデータ消失防止に集中する）。
- 削除マップの一定期間取り消し（候補015「ゴミ箱」に委ねる）。

---

## 2. 既存実装の調査と制約

### 2.1 ストレージとセッションの構造
- `localStorage` のキー:
  - `MAP_INDEX_STORAGE_KEY` (`draw-my-map.maps.v1`): マップ一覧（`MapIndexV1`: `{ version: 1, currentMapId: string, maps: MapIndexEntry[] }`）。各項目は `id`, `name`, `createdAt`, `updatedAt` を持つ。
  - `mapBodyKey(id)` (`draw-my-map.maps.v1.doc.<id>`): 各マップ本体の `MapDocumentV3` JSON。
  - ジャーナルキー: `draw-my-map.branch-move.v1`（枝移動）、`draw-my-map.library-restore.v1`（一括復元）。
- `useMapLibrary.ts` と `mapLibrarySession.ts`:
  - 通常モードでは `createPersistentMapSession` が `MapStorageSession`（`readBody`, `writeBody`, `registerFlush`, `registerBackupSnapshot`, `readBackupSnapshot`）を生成する。
  - `writeBody` は自タブのセッション番号とインデックス内でのマップ存在を照合して本体を書き、マップの `updatedAt` を進めた新しいインデックスを書き込む。
  - `flushPendingSave` は未保存スナップショットを即座に同期書き込みする。
- `useMapStorageAutoSave.ts`:
  - 300ms デバウンスで `requestSnapshotSave` を呼び、`session.writeBody` を実行する。
  - ヘッダーの `MapSaveStatus` に `"checking" | "saved" | "beforeSave" | "restoreFailed" | "pending" | "failed" | "protected"` などの保存状態を渡す。
- `useMapPersistence.ts`:
  - 現在のノードと配置モードから `currentSnapshot` を保持し、`storageSession` と自動保存、手動保存（JSON書き出し）、画像書き出しを結ぶ。

### 2.2 保護モードの明確な概念分離
- **既存の「保護モード (`storageMode === "protected"`)」**:
  - `localStorage` の初回読み込み失敗やジャーナル破損時に、`key={`${mapId}:${storageMode}`}` によるページ全体の再マウントを伴い、永続化を完全に切断してメモリのみで動作する隔離モード。
- **本機能における「競合ガード状態 (`conflictState !== "none"`)」**:
  - `storageMode` は通常の `"persistent"` を維持する（再マウントさせない）。
  - メモリ上の競合フラグ `conflictState: ConflictState` を保持する:
    ```typescript
    export type ConflictState =
      | "none"
      | "conflict"          // 別タブ更新があり、自タブにも未保存編集がある（上書き防止で保存ブロック）
      | "externalUpdate"    // 別タブ更新があるが、自タブは未保存編集なし（最新読み込み案内）
      | "externallyDeleted"; // 別タブでマップが削除された
    ```
  - `conflictState === "conflict"` または `"externallyDeleted"` の間、現在のマップに対する**自動保存タイマーおよび `flush` による上書き書き込みのみを安全に抑止**する。
  - これにより、自タブの未保存編集・Undo/Redo 履歴・キャンバスのビューポートをそのまま保持した状態で、ユーザーが「別名で保存」「最新を読み込む」「JSON書き出し」を安全に選択できる。

### 2.3 考慮すべき知見（review-lessons.md より）
- **L-001**: 競合検知時や保護モード下で保存をスキップ・失敗した際、呼び出し元が成功と誤認しないよう成否（`MapBodyWriteResult` / `MapFlushResult` に `{ status: "conflict" }` を追加）を明示して後続処理をガードする。
- **L-002**: 別タブでのマップ削除（キー不在）と読み取り失敗（JSON破損等）を厳密に区別し、競合ガード時も現在のマップ本体・Undo/Redo 履歴・選択状態を安易に null や空データで上書き破棄しない。
- **L-061**: 「競合ガード状態」導入時、自動保存だけでなく、マップ切替、新規作成、アウトライン編集、枝移動、箇条書き取り込み、Undo/Redo など既存の全操作入口に対するガード仕様を明確に定める（後述 3.3 節）。
- **L-037 / L-571**: storage イベントや再読込結果の処理をマップIDだけでなく `sessionNumber`（セッション世代）も検証し、ABA問題を防止する。
- **L-669**: 別タブでの更新を検知して最新ドキュメントを再読み込みしている最中や失敗後に、現在のタブの自動保存タイマーが発火して古いメモリ状態の全項目でストレージを上書きしないようガードする。
- **L-659**: 新旧判定を端末のローカル時計（`updatedAt`）の比較だけに委ねず、ストレージ上の実際の保存値との照合を行い、タイムスタンプ更新による誤上書きを防ぐ。
- **L-469**: window "storage" イベントリスナーを `useEffect` で購読する際、StrictMode の二重実行でリスナーが永久に失われないように正しくクリーンアップと再購読を行う。
- **L-483**: 競合状態フラグを `localStorage` に残さずメモリ内でのみ保持する。
- **L-545**: 競合解決（別名保存など）でストレージ書き込み成功後に React state を更新する。
- **L-322**: storage イベントの監視、競合判定ロジック、競合通知・ダイアログUI状態を単一責任に分離する。
- **L-153**: 競合通知は既存の常設ライブリージョンを通じてスクリーンリーダーに確実に通知する。
- **L-408**: 破棄を伴う「最新を読み込む」の確認ダイアログはキャンセルを初期フォーカスにし、キーリピートを抑止する。
- **L-530**: JSON 文字列表記差ではなく正規化データ構造で同値性を比較する。

---

## 3. 競合検出と排他制御のメカニズム

競合検出は、**① 受信イベント駆動（`storage` イベント）** と **② 書込時楽観ロック検証（`writeBody` 直前の検証）** の二重防御で実現する。

```text
[別タブ A]                      [自タブ B]
    |                               |
    |-- localStorage.setItem() ---->| (1) storage イベント受信 (useStorageConflictMonitor)
    |                               |     ├─ key === mapBodyKey(currentMapId) かつ newValue !== null
    |                               |     │   ├─ hasPendingEdits === true (未保存編集あり):
    |                               |     │   │   ⇒ conflictState = "conflict"
    |                               |     │   │   ⇒ 自動保存タイマー破棄 & flush をブロック
    |                               |     │   │   ⇒ 保存状態バッジ "conflict" & 競合通知バー表示
    |                               |     │   └─ hasPendingEdits === false (未保存編集なし):
    |                               |     │       ⇒ conflictState = "externalUpdate"
    |                               |     │       ⇒ 通知バーで「別タブで更新されました [最新の内容を読み込む]」
    |                               |     │       ※ この状態で自タブで編集が発生した場合は即 "conflict" へ昇格
    |                               |     └─ currentMap が一覧から消失、または本体が removeItem された:
    |                               |         ⇒ conflictState = "externallyDeleted"
    |                               |         ⇒ 自動保存ブロック & 保存状態バッジ "externallyDeleted"
    |                               |
    |                               | (2) writeBody 実行直前の検証（楽観ロック）
    |                               |     storage.readMapBody(id) を確認
    |                               |     ├─ lastPersistedSnapshotRef と不一致:
    |                               |     │   ⇒ 書き込みを中止して { status: "conflict" } を返却
    |                               |     │   ⇒ useMapStorageAutoSave が conflictState = "conflict" を発火
    |                               |     └─ 一致 ⇒ 安全に書き込み実行 & lastPersistedSnapshotRef を更新
```

### 3.1 監視対象のストレージキー
1. **現在のマップ本体キー** (`draw-my-map.maps.v1.doc.<currentMapId>`):
   - `newValue !== null`: 別タブで現在開いているマップ本体が更新された。
   - `newValue === null`: 別タブで現在開いているマップ本体が削除された。
2. **マップ一覧キー** (`draw-my-map.maps.v1`):
   - 一覧から `currentMapId` が削除されたことを検知。

### 3.2 ダーティ判定の定義
- 未保存の編集があるかどうかのフラグ `hasPendingEdits` は、以下のように厳密に導出する:
  ```typescript
  hasPendingEdits =
    confirmedSnapshot !== null
      ? currentSnapshot !== confirmedSnapshot
      : currentSnapshot !== initialEmptySnapshot;
  ```
  - `confirmedSnapshot`: 自タブがマウント時の初回復元、または自タブ自身の `writeBody` で正常に保存が完了した最新のスナップショット文字列。
  - `initialEmptySnapshot`: 新規マップ作成直後の初期状態（`restoreOrigin === "empty"`）から導出したスナップショット文字列。
  - `currentSnapshot`: 現在のキャンバス（`nodes`, `layoutMode`）から生成された最新のスナップショット文字列。
  - これにより、新規マップ作成直後の未編集状態を誤って「未保存編集あり」と判定することを防ぐ。

### 3.3 既存の全操作に対するガード仕様（知見 L-061）

競合検知中（`conflictState === "conflict"`）、外部削除検知中（`conflictState === "externallyDeleted"`）、およびクリーン時外部更新（`conflictState === "externalUpdate"`）における既存の全操作に対する挙動を以下の通り厳密に規定する。

| 操作種別 | 競合中 (`"conflict"`) | 外部削除中 (`"externallyDeleted"`) | 外部更新あり (`"externalUpdate"`) | 理由・安全設計 |
| :--- | :--- | :--- | :--- | :--- |
| **自動保存 (`useMapStorageAutoSave`)** | **即座にブロック**（タイマー破棄） | **即座にブロック**（タイマー破棄） | **未変更のため走らない**（※編集されたら `conflict` に昇格して即ブロック） | 別タブの変更の上書きや不正書き込みを防止。 |
| **手動 flush (`flushPendingSave`)** | **即座に拒否**（`{ status: "conflict" }`） | **即座に拒否**（`{ status: "conflict" }`） | `{ status: "unchanged" }` | 旧マップへの flush で別タブを壊さない。 |
| **キャンバス上のノード編集 / 移動** | **許可**（メモリ上のみ更新） | **許可**（メモリ上のみ更新） | **許可**（即座に `conflictState = "conflict"` へ昇格） | 入力中の内容を破壊せず、「別名で保存」や「JSON書き出し」で救出できるようにする。 |
| **Undo / Redo** | **許可**（メモリ上のみ更新） | **許可**（メモリ上のみ更新） | **許可**（変更が生じれば `conflict` へ昇格） | 自タブの編集履歴はメモリ内にあり安全に辿れる。 |
| **アウトライン編集** | **許可**（メモリ上のみ更新） | **許可**（メモリ上のみ更新） | **許可**（編集があれば `conflict` へ昇格） | 自タブの編集内容はメモリ内にあり、自動保存はブロックされるため安全。 |
| **JSON書き出し** | **許可** | **許可** | **許可** | 現在のメモリ上状態の即座なローカル救出手段として常に利用可能。 |
| **画像書き出し (PNG/SVG)** | **許可** | **許可** | **許可** | 画面描画からのエクスポートでありストレージを破壊しないため許可。 |
| **マップ一覧 (`MapLibraryDialog`) 開閉** | **許可** | **許可** | **許可** | 一覧の閲覧や他マップの状況確認は許可。 |
| **新しいマップ作成 (`createMap`)** | **ガードして実行（旧マップ flush バイパス）** | **ガードして実行（旧マップ flush バイパス）** | **通常実行** | 通常は切替時に旧マップを flush するが、競合中は旧マップの flush をスキップして安全に新規作成へ遷移する。 |
| **別マップへの切り替え (`switchMap`)** | **安全に拒否（中断通知）** | **安全に拒否（中断通知）** | **通常実行** | 「競合中のため切り替えられません。『別名で保存』または『最新を読み込む』で解決してください」と通知して中断（新規確認ダイアログの肥大化を回避）。 |
| **枝の別マップへの移動 (`moveBranchToMap`)** | **拒否**（エラー通知表示） | **拒否**（エラー通知表示） | **拒否**（エラー通知表示） | 枝移動は複数キーの原本トランザクションを要するため、競合中は安全のため禁止する。 |
| **箇条書きからの追加 (`insertForest`)** | **許可**（メモリ上のみ更新） | **許可**（メモリ上のみ更新） | **許可**（即座に `conflict` に昇格） | キャンバスノード編集と同様、メモリ上に反映され自動保存はブロックされる。 |
| **一括バックアップ・追加復元** | **拒否** | **拒否** | **拒否** | 既存仕様通り、現在マップの完全な保存成功実績がない状態では一括操作を拒否する。 |

---

## 4. 競合解決フローと UI 設計

### 4.1 競合検知時の画面表示と型体系

#### 1. 保存状態バッジ (`MapSaveStatus.tsx`)
`MapSaveStatus` 型に以下のステータスを追加する:
```typescript
export type MapSaveStatus =
  | "checking"
  | "saved"
  | "beforeSave"
  | "restoreFailed"
  | "pending"
  | "failed"
  | "protected"
  | "conflict"           // 追記: 赤色警告バッジ「競合が発生しました」
  | "externallyDeleted"; // 追記: 赤色警告バッジ「削除されました」
```

#### 2. 操作通知バー (`MapOperationNoticeList.tsx` / `AppHeader.tsx`)
`MapEditor` の操作通知バー（既存の9系統）に、**10系統目として「競合通知（`conflict.notice`）」** を追加する。
- 競合通知は常設の `role="alert"` / `aria-live="assertive"` を用いてスクリーンリーダーに確実に通知する（知見 L-153）。
- アクションボタン群（「別名で保存」「最新を読み込む」「JSON書き出し」）を通知行内にインライン配置する。
- 文言とボタン構成:
  - **競合時 (`conflictState === "conflict"`)**:
    `別タブでこのマップが更新されました。上書きを防ぐため自動保存を停止しています。`
    ボタン: `[別名で保存]` `[最新を読み込む]` `[JSON書き出し]`
  - **外部削除時 (`conflictState === "externallyDeleted"`)**:
    `このマップは別タブで削除されました。`
    ボタン: `[別名で保存]` `[JSON書き出し]`
  - **クリーン時の外部更新 (`conflictState === "externalUpdate"`)**:
    `別タブでこのマップが更新されました。`
    ボタン: `[最新の内容を読み込む]`

### 4.2 ユーザーのアクションと処理詳細

#### 1. 別名で保存（Save as New Map）— ワンクリック・flush バイパス仕様
- **動作仕様**:
  1. 名前入力ダイアログは挟まず、ボタン押下により自動生成名（例: `旅行計画（退避）`）で即座に新規作成・切り替えを実行するワンクリック動作とする。
  2. 退避用のマップ名は、`createConflictCopyName(currentMapName)`（例: `旅行計画（退避）`、50文字上限を超えないようトリム）を自動生成する。
  3. `useMapLibrary` の `saveCurrentAsNewMap(name: string, snapshot: MapBackupSnapshot)` を呼ぶ。
  4. この関数は**現在の旧マップの flush を完全にバイパス**し、旧マップのストレージキー（本体・インデックス）には一切触れない。
  5. 新しいマップID（`pickNewMapId`）を採番し、新マップ本体として自タブの現在の `currentSnapshot` を書き込み、インデックスに新マップを追加して保存する。
  6. ストレージ書き込み成功後、自タブの現在のマップをその新しいマップIDへ切り替え（新セッション番号の発行）、`conflictState` を `"none"` にリセットする。

#### 2. 最新の内容を読み込む（Reload External Content）
- **未保存の編集がある場合 (`conflictState === "conflict"`)**:
  - `MapConflictConfirmDialog`（モーダル）を表示する。
  - 「現在のタブの未保存の変更は失われます。別タブの最新内容を読み込みますか？」
  - 初期フォーカスは安全側の「キャンセル」（知見 L-408）。
  - キーリピート（Enter/Space）の連打による誤確定を抑止する。
- **未保存の編集がない場合 (`conflictState === "externalUpdate"`)**:
  - 確認ダイアログを挟まず即座に読み込む。
- **読み込み確定処理**:
  1. ストレージから最新の `storage.getItem(mapBodyKey(currentMapId))` を読み取る。
  2. 既存の `useResettingMapReplacement.replaceMapAndReset` を用いて、ノード配列・レイアウトモード・イラストを置換し、Undo/Redo 履歴をリセットする。
  3. `confirmedSnapshot` を最新の内容に更新し、`conflictState` を `"none"` にリセットする。
  4. 完了通知「別タブの最新内容を読み込みました。」を表示する。

#### 3. JSON書き出し（Export JSON）
- 既存の `useMapJsonExport` を呼び出し、現在のメモリ上の状態を即座にローカルファイルとしてダウンロードさせる。

---

## 5. モジュール設計と責務分割

単一責任の原則（SRP）と知見 L-322 を遵守し、責務ごとに独立したモジュールとして設計する。

```text
client/src/
├── domain/
│   └── mapLibrary/
│       ├── mapConflict.ts              # 競合判定・差分比較・退避名生成の純粋関数群
│       └── mapConflictMessages.ts      # ユーザー向け通知文言
├── services/
│   └── persistence/
│       └── storageEventHub.ts          # window storage イベントの監視と抽象化
├── hooks/
│   ├── useStorageConflictMonitor.ts    # storage イベントを購読し競合状態を管理するフック
│   └── useMapConflictActions.ts        # 別名保存・最新読み込み等の競合解決アクションフック
└── components/
    └── layout/
        ├── MapConflictNotice.tsx       # 競合通知とアクションボタンのコンポーネント
        └── MapConflictConfirmDialog.tsx # 最新読み込み時の破棄確認モーダル
```

### 5.1 `domain/mapLibrary/mapConflict.ts`（純粋ロジック層）
- `classifyStorageChange(params: { key: string | null; newValue: string | null; currentMapId: string; hasPendingEdits: boolean; isCurrentMapInIndex: boolean }): ConflictState`:
  - `"none" | "conflict" | "externalUpdate" | "externallyDeleted"` を純粋判定する。
- `isDocumentContentEqual(docA: MapDocumentV3, docB: MapDocumentV3): boolean`:
  - 表記差や空白に惑わされず、正規化されたデータ構造で同一性を判定する（知見 L-530）。
- `createConflictCopyName(baseName: string): string`:
  - 末尾に「（退避）」を付与し、50コードポイントを超えないよう切り詰めた安全な退避名を生成する。

### 5.2 `services/persistence/storageEventHub.ts`（サービス層）
- `subscribeStorageEvent(listener: (event: StorageEvent) => void): () => void`:
  - `window.addEventListener("storage", listener)` を安全に登録し、クリーンアップ関数を返す。
  - テスト環境で安全に差し替え可能なファサードを提供する。

### 5.3 `hooks/useStorageConflictMonitor.ts`（フック層）
- 必須引数:
  ```typescript
  export interface UseStorageConflictMonitorOptions {
    mapId: string;
    sessionNumber: number; // L-037 / L-571 世代照合用
    hasPendingEdits: boolean;
    storage: MapLibraryStorage;
    onExternalChange: (kind: Exclude<ConflictState, "none">) => void;
  }
  ```
- `useEffect` で `subscribeStorageEvent` を購読。`useLatestRef` で最新の options を参照し、StrictMode 二重実行でもリスナーが喪失しない（知見 L-469）。
- イベント受信時に、`sessionNumber` が現在のセッションと一致していることを照合した上で、`classifyStorageChange` を呼び出す。
- 競合または削除を検知した場合は、即座に `onExternalChange` を発火して自動保存タイマーを破棄・停止させ、状態を反映する。

### 5.4 `mapLibrarySession.ts` / `useMapStorageAutoSave.ts` の拡張
- `MapBodyWriteResult` および `MapFlushResult` の型定義に `{ status: "conflict" }` を追加（既存の型体系と完全一致）:
  ```typescript
  export type MapBodyWriteResult =
    | { status: "saved" }
    | { status: "conflict" }
    | { status: "failed"; error: string }
    | { status: "inactive" };

  export type MapFlushResult =
    | { status: "saved" }
    | { status: "unchanged" }
    | { status: "conflict" }
    | { status: "failed"; error: string };
  ```
- **楽観ロック検証**:
  `createPersistentMapSession` の内部で `lastPersistedSnapshotRef`（初回はセッション作成時のストレージ読み取り値、`writeBody` 成功時に更新）を保持する。
  `session.writeBody` の実行直前に、`storage.readMapBody(id)` を同期呼出する。`lastPersistedSnapshotRef` と異なっている場合は、書き込みを行わずに即座に `{ status: "conflict" }` を返す。
- **楽観ロック検知時の伝播**:
  `useMapStorageAutoSave` は `writeBody` から `conflict` を受け取った場合、`saveStatus` を `"conflict"` に遷移させ、親コンポーネント（`MapEditor`）のコールバックを呼び出して `conflictState = "conflict"` を設定する。

---

## 6. テスト方針と検証計画

### 6.1 TDD による単体・統合テスト
1. **Domain 層 (`mapConflict.test.ts`)**:
   - storage イベントの各キー・値変更パターンに応じた正確な分類判定（未保存あり/なし、削除、無関係なキー）。
   - ドキュメント同値性判定（ノード順、重要度、イラスト、余剰プロパティ除去）。
   - 退避名生成の文字数切り詰め（50文字境界）。
2. **Service 層 (`storageEventHub.test.ts`)**:
   - リスナーの登録・解除・多重登録防止。
   - `afterEach` でのスパイ完全復元（知見 L-643, L-560）。
3. **Hook 層 (`useStorageConflictMonitor.test.ts`, `useMapStorageAutoSave.test.ts`)**:
   - 未保存編集がある場合の競合検知と自動保存停止コールバックの発火。
   - 未保存編集がない場合の最新案内検知、およびその後の編集による `conflict` 昇格。
   - 別タブでのマップ削除検知。
   - `writeBody` 直前の楽観ロック不一致による `{ status: "conflict" }` 返却と状態遷移。
   - `sessionNumber` 世代不一致時のイベント無視（ABA 問題テスト）。
   - StrictMode 二重実行時のリスナー維持（知見 L-469）。
4. **UI / 統合テスト (`MapConflict.test.tsx`, `MapEditor.test.tsx`)**:
   - 競合通知の表示とアクセシビリティ（`role="alert"` / `aria-live="assertive"`、知見 L-153）。
   - 「別名で保存」ボタン押下時の旧マップ flush スキップ、新規マップ作成・切り替え・元データ維持。
   - 「最新を読み込む」ボタン押下時の確認ダイアログ表示、キャンセル時の状態維持、確定時の最新データ反映。
   - キー連打や Enter 押し続けによる誤実行防止（知見 L-408）。

### 6.2 `npm run verify`
- 全テスト（Jest）、TypeScript 型チェック（`tsc --noEmit`）、ESLint、Tailwind スキャン、本番ビルド（`next build`）の完全通過。

---

## 7. 教訓の適用一覧

- **L-001**: `MapBodyWriteResult` / `MapFlushResult` に `{ status: "conflict" }` を追加し、成否を呼び出し元で厳密に確認する。
- **L-002**: 別タブ削除時も現在のメモリ上のマップや履歴を null や空にリセットせず、保護モードで完全保持する。
- **L-061**: 競合ガード状態における既存全操作のガード表（3.3節）を規定し、別名保存時の旧マップ flush バイパスを実装する。
- **L-037 / L-571**: storage イベント処理でマップIDだけでなく `sessionNumber` を照合し、ABA問題を防止する。
- **L-153**: 競合通知バーは既存の常設通知コンポーネントを用いてアクセシブルに通知する。
- **L-322**: イベント購読・判定・UIステートを個別モジュールに責任分離する。
- **L-408**: 競合確認ダイアログの「最新を読み込む（破棄）」は既定フォーカスにせず、キャンセルを初期フォーカスにし、キーリピートを抑止する。
- **L-469**: `useEffect` でのリスナー登録・解除を StrictMode 安全に実装する。
- **L-483**: 競合状態フラグを localStorage に保存せずメモリ内で完結させる。
- **L-530**: JSON 文字列表記差ではなくデコード済みデータで正規化比較を行う。
- **L-545**: 別名保存はストレージ書き込み成功後に state を切り替える。
- **L-669**: 別タブ更新検知中・再読込中に古いメモリ状態の自動保存がストレージを上書きしないよう即座にブロックする。
