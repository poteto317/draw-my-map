# Phase 12: 複数マップの保存・切り替え Implementation Plan

> **For agentic workers:** `superpowers:subagent-driven-development`でタスクを1つずつ実装し、別担当の仕様・品質レビュー後に次へ進む。インライン実装はユーザーの明示指示時のみ。各タスクのサブエージェントには、そのタスク本文、Global Constraints、依存する前タスクの Interfaces だけを渡す。

**Goal:** ROADMAP Phase 12の5項目を実装し、名前を付けた複数のマップをブラウザ内に保存し、編集履歴や非同期処理を混在させずに切り替えられるようにする。
**Architecture:** localStorage をインデックス（`draw-my-map.maps.v1`）とマップ本体（`draw-my-map.maps.v1.doc.<id>`、中身は V3）に分ける。インデックスの解析・更新・起動計画は純関数（`domain/mapLibrary/`）、localStorage の読み書きは `services/persistence/mapLibraryStorage.ts` だけ、状態と操作の順序は `useMapLibrary`、配線は `Home`（シェル）が受け持つ。今の `Home` の中身は `MapEditor` へ移し、`key={mapId}` で再マウントして履歴と表示状態を破棄する。保存はセッション番号で照合する `MapStorageSession` を通す。
**Tech Stack:** TypeScript、React 19、Next.js 16、Jest、Testing Library。追加依存なし。
**Spec:** `docs/superpowers/specs/2026-10-21-phase12-multi-map-design.md`

## Global Constraints

- 新規依存なし。`Node`、`NodeMapState`、V3 の保存形式、JSON の形式、履歴の形式を変えない。マップ名を JSON に含めない。
- localStorage を直接読み書きするのは `services/persistence/mapLibraryStorage.ts` だけにする（旧キーの読み取り・削除は `mapStorage.ts` の関数を `mapLibraryStorage.ts` から呼ぶ）。フックやコンポーネントは `localStorage.getItem`・`setItem`・`removeItem` を直接呼ばない（L-476）。既存の `MAP_STORAGE_KEY`（`draw-my-map.map.v1`）は旧キーとして移行処理だけが使う。
- キー: インデックス `draw-my-map.maps.v1`、本体 `draw-my-map.maps.v1.doc.<id>`、退避 `draw-my-map.maps.v1.corrupt-backup`、旧キー `draw-my-map.map.v1`。本体のキーは `mapBodyKey(id)` の1か所で作る（L-539）。id は `/^[A-Za-z0-9_-]{1,64}$/`。
- 名前: 制御文字（U+0000〜U+001F、U+007F）を半角空白へ、前後の空白を除き、空なら「無題のマップ」。長さはコードポイント数で上限50。超えたら確定させず「マップ名は50文字以内で入力してください。（現在 N 文字）」を表示する。重複は許可。
- 純関数（`domain/mapLibrary/`）、保存サービス、React フック、配線（`Home`）、表示と操作（部品）の境界を守る。
- 保存の結果は列挙した結果型で返し、呼び出し元は成功したときだけ状態更新・通知・後続処理を行う（L-001）。localStorage を先に書き、成功してから React の状態を更新する（L-545）。保存サービスは例外を外へ投げない（L-056）。
- 同じイベント内のインデックス更新は、最新のインデックスを持つ ref を基準に順に計算する（L-453）。ref はレンダー中に書き換えず、操作の中で次の値を計算したときと `useLayoutEffect` で同期する（L-468、L-521）。
- エディタの外へ結果を出す非同期処理（保存、ダウンロード、シェルへの通知）は、マップ id や revision の値ではなく、セッション番号とアンマウントの判定で照合する（L-571、L-103、L-588）。
- 新しい props と引数は必須にする（省略可能な引数と既定値を足さない。既存の差し替え用の省略可能な依存はそのまま）。実際の `Home` から `MapEditor` とヘッダーまで通す結合テストで配線を確かめる（L-060）。
- 暫定の例外（Task 6〜20 の間だけ。Task 21 で削除する）: `mapStorage.ts` の `createLegacyMapStorageSession` と `writeStoredMapJson` が旧キー `draw-my-map.map.v1` を読み書きし、`Home`（Task 20 以降は `Home` から `MapEditor` へ渡す値）だけがそれを使う。Task 10〜16 で `Home`・`MapStage` に渡す暫定の固定値（`enabled: true`、`shortcutsEnabled`、`mapName: DEFAULT_MAP_NAME`、`mapControls={null}`）も同じく Task 20・21 で置き換える。上の「localStorage を直接読み書きするのは `mapLibraryStorage.ts` だけ」と「`MAP_STORAGE_KEY` は移行処理だけが使う」は、この暫定の例外を除いて適用する。
- 通知の文言は設計書の「通知の文言」と「分岐ごとのインデックスと通知」の表をそのまま使う。自動保存の失敗の文言は「ブラウザへ自動保存できませんでした。不要なマップを削除するか、JSONで書き出してください。」に変える。
- 他タブとの同時編集、`storage` イベントの購読、複製・並べ替え・フォルダ・検索・ゴミ箱、複数マップの一括書き出し、`beforeunload` での保存、`app/layout.tsx` の `title`・`lang` の修正、IndexedDB への移行は行わない。
- 実装は `.worktrees/codex/phase12-multi-map` の `codex/phase12-multi-map` ブランチで行う。タスク単位のサブエージェント実装、別担当の仕様・品質レビュー、TDD（先にテストを書いて RED を確かめる）、各タスクの最後に `cd client && npm run verify` を必須とする。途中のタスクでも verify が通る状態で終える。
- コミット・push・PR 作成は依頼時のみ。依頼された場合のメッセージは Conventional Commits（例: `feat(map-library): ...`、`test(map-library): ...`、`docs(map-library): ...`）にする。最後のタスクで `ROADMAP.md` を実態に合わせて更新し、Phase 13 を完了にしない。

## Review Focus

- 移行: 旧キーだけがある起動で本体とインデックスができ、旧キーはその起動では残り、次の起動で消える。StrictMode の二重 effect で後始末が同じ起動に走らない（Task 3/5/8/23）。
- 本体とインデックスの順序: 移行は本体 → インデックス、失敗時は本体を `removeItem` で戻し、戻す操作の失敗も結果に出る。削除はインデックス → 本体（Task 4/5/9）。
- 開いているマップの削除: セッション番号を本体の削除より先に進め、旧エディタの保存待ちが消した本体を書き戻さない（Task 9）。
- A → B → A: 最初の A のセッションの `writeBody` が `inactive` になる（Task 8/22）。
- flush: 切り替え・新規作成の前に保存待ちを同期で書き、失敗したら中止。開いていないマップの削除の後に再試行し、成功したら保存失敗の通知だけを消す（Task 7/9/19/22）。
- ダイアログ: フォーカスの閉じ込め・Escape・戻し先、表示中のショートカット停止、`inert`（Task 10/11/12/17/18/19/21/22）。

## ファイル構成

| ファイル | 責務 | 作成タスク |
| :--- | :--- | :--- |
| `client/src/domain/mapLibrary/mapName.ts` | 名前の正規化・長さ検証・読み込み時の切り詰め | 1 |
| `client/src/domain/mapLibrary/mapFileName.ts` | `toSafeFileNameBase`、書き出しファイル名の組み立て | 1 |
| `client/src/domain/mapLibrary/mapTimestamp.ts` | 日時の補正と「更新: YYYY/MM/DD HH:mm」の表示 | 1 |
| `client/src/domain/mapLibrary/mapIndex.ts` | インデックスの型・デコード・エンコード・更新・表示順・次に開くマップ・id の選択 | 2 |
| `client/src/domain/mapLibrary/mapLibraryStartup.ts` | 起動の計画（純関数） | 3 |
| `client/src/services/persistence/mapLibraryStorage.ts` | キー、インデックス・本体・退避・旧キーの読み書き、移行の書き込みと戻し | 4 |
| `client/src/testing/mapLibraryTestStorage.ts` | テスト専用の補助関数（seed、読み取り、記録する偽の Storage） | 4 |
| `client/src/types/mapStorageSession.ts` | `MapStorageSession` と結果型 | 5 |
| `client/src/services/persistence/mapIdGenerator.ts` | `generateMapId` | 5 |
| `client/src/services/persistence/mapLibraryStartupRunner.ts` | 起動の計画の実行 | 5 |
| `client/src/services/persistence/protectedStorageSession.ts` | 保護モード用のセッション | 5 |
| `client/src/testing/createTestStorageSession.ts` | フックのテスト用の偽セッション | 6 |
| `client/src/domain/mapLibrary/mapLibraryMessages.ts` | シェルの操作の通知の文言 | 8 |
| `client/src/hooks/useMapLibrary.ts` | 起動・インデックスの状態・作成・切り替え・名前変更・削除・セッション・flush の登録先 | 8, 9 |
| `client/src/components/layout/MapLibraryControls.tsx` | ヘッダーの現在のマップ名と2つのボタン | 16 |
| `client/src/components/layout/MapLibraryNoticeRegion.tsx` | シェルの常設ライブリージョン | 16 |
| `client/src/types/mapLibraryDialog.ts` | ダイアログの画面・フォーカス先・通知の型 | 17 |
| `client/src/components/layout/useDialogFocusTrap.ts` | フォーカスの閉じ込め・Tab の循環・Escape | 17 |
| `client/src/components/layout/MapLibraryDialog.tsx` | ダイアログの枠と画面の切り替え | 17 |
| `client/src/components/layout/MapLibraryListScreen.tsx` | 一覧の画面 | 17 |
| `client/src/components/layout/MapLibraryNameForm.tsx` | 新規作成・名前変更の画面 | 18 |
| `client/src/components/layout/MapLibraryDeleteConfirm.tsx` | 削除の確認の画面 | 18 |
| `client/src/hooks/useMapLibraryDialogState.ts` | ダイアログの画面遷移・通知の振り分け・フォーカスの戻し先 | 19 |
| `client/src/components/map/MapEditor.tsx` | 今の `Home` の中身 | 20 |
| `client/src/app/page.tsx` | シェル | 20, 21 |

## 既存のページのテストの移行方針

既存のページのテスト（`page.test`、`pageHistory`、`pageDuplication`、`pageClipboard`、`pageCollapse`、`pageSearch`）は固定キー `draw-my-map.map.v1` を `setItem`・`getItem` している。次の3段階で移行し、どの段階でも `npm run verify` が通るようにする。

1. **Task 4**: テスト専用の補助関数 `seedMapLibrary(storage, maps, options)`、`readActiveMapJson(storage)`、`activeMapBodyKey(storage)` を `client/src/testing/mapLibraryTestStorage.ts` に作り、補助関数自体のテストを書く。この時点ではページのテストは変えない（`Home` はまだ旧キーを使う）。
2. **Task 21**（ページの結合）: `Home` が新しい保存構造を使い始めると、旧キーへの書き込みが無くなる。同じタスクの中で、保存結果を読む箇所だけを置き換える。
   - `window.localStorage.getItem(STORAGE_KEY)`・`getItem("draw-my-map.map.v1")` → `readActiveMapJson(window.localStorage)`。
   - `setItem.mock.calls.filter(([key]) => key === STORAGE_KEY)` → `filter(([key]) => key === activeMapBodyKey(window.localStorage))`。
   - 初期データの `window.localStorage.setItem(STORAGE_KEY, ...)` は変えない。インデックスが無いので移行の経路で読まれ、そのまま動く。
3. **Task 23**（既存テストの移行）: 初期データの `setItem(STORAGE_KEY, ...)` を `seedMapLibrary(window.localStorage, [{ json }])` に置き換え、各ファイルの `STORAGE_KEY` 定数を消す。旧キーからの移行は `page.test.tsx` の専用のテストにだけ残す。`setItem` の回数を見るテストは、キーで絞ってから回数と値の履歴を確かめる（L-419）。

## 進め方

開始前に `git status` と worktree を確認し、既存のユーザー変更を reset しない。各タスクは「テスト追加 → 対象テストの RED を確認 → 実装 → 対象テストの GREEN → `cd client && npm run verify`」の順で進め、別のサブエージェントで仕様・品質を確認する。テストのコマンドは `client` ディレクトリで実行する。ファイルのパスはリポジトリ相対。日時を扱うテストは `now` を注入して固定し、ローカル時刻を見るテストはファイル冒頭で `process.env.TZ = "Asia/Tokyo";` を設定する（L-181）。

---

### Task 1: 名前・ファイル名・日時の純関数

**Files**
- Create: `client/src/domain/mapLibrary/mapName.ts`
- Create: `client/src/domain/mapLibrary/mapFileName.ts`
- Create: `client/src/domain/mapLibrary/mapTimestamp.ts`
- Create: `client/src/domain/mapLibrary/__tests__/mapName.test.ts`
- Create: `client/src/domain/mapLibrary/__tests__/mapFileName.test.ts`
- Create: `client/src/domain/mapLibrary/__tests__/mapTimestamp.test.ts`

**Interfaces**
- Produces（`mapName.ts`）:
  ```ts
  export const DEFAULT_MAP_NAME = "無題のマップ";
  export const MAX_MAP_NAME_LENGTH = 50;
  export function normalizeMapName(input: string): string;
  export function countMapNameLength(name: string): number; // Array.from(name).length
  export type MapNameValidation =
    | { ok: true; name: string }
    | { ok: false; length: number; message: string };
  export function validateMapNameInput(input: string): MapNameValidation;
  export function normalizeStoredMapName(raw: string): string; // 正規化してから先頭50コードポイントへ切り詰める
  ```
- Produces（`mapFileName.ts`）:
  ```ts
  export type MapFileExtension = "json" | "png" | "svg";
  export function toSafeFileNameBase(name: string): string;
  export function formatMapFileTimestamp(now: Date): string; // "YYYYMMDD-HHmmss"（ローカル時刻）
  export function createMapFileName(mapName: string, extension: MapFileExtension, now: Date): string;
  ```
- Produces（`mapTimestamp.ts`）:
  ```ts
  export const UNKNOWN_MAP_TIMESTAMP = "1970-01-01T00:00:00.000Z";
  export function normalizeMapTimestamp(value: unknown): { value: string; repaired: boolean };
  export function formatMapUpdatedAt(iso: string): string; // "更新: YYYY/MM/DD HH:mm" / "更新: 不明"
  ```

- [ ] `mapName.test.ts` を書く。
  - `normalizeMapName`: `"  旅行  "` → `"旅行"`、`""`・`"   "` → `"無題のマップ"`、`"a\tb\nc\u007f"` → `"a b c"`（制御文字を空白へ置き換えた後に末尾の空白も除く）、`"\u0000"` → `"無題のマップ"`。
  - `countMapNameLength`: `"😀"` → 1、`"👨‍👩‍👧"`（ZWJ 結合）→ 5（コードポイント数）、`"あ".repeat(50)` → 50。
  - `validateMapNameInput`: 49文字・50文字（`"a".repeat(49) + "😀"` を含む）→ `ok: true`、51文字（`"😀".repeat(51)`）→ `{ ok: false, length: 51, message: "マップ名は50文字以内で入力してください。（現在 51 文字）" }`。前後の空白は数えない（`" " + "a".repeat(50) + " "` → `ok: true`）（L-182）。
  - `normalizeStoredMapName`: `"😀".repeat(60)` → `"😀".repeat(50)`（サロゲートペアを壊さない）、`""` → `"無題のマップ"`。
- [ ] `mapFileName.test.ts` を書く（L-161）。
  - `toSafeFileNameBase`: `"a/b:c*?"` → `"a_b_c__"`、`'x\\y"z<>|'` → `"x_y_z___"`、`"a\u0001b"` → `"a_b"`、`"  a   b  "` → `"a b"`、`"..secret."` → `"secret"`、`"name. . "` → `"name"`、`"CON"`・`"con"`・`"LPT9"` → `"_CON"`・`"_con"`・`"_LPT9"`、`"CONSOLE"` → `"CONSOLE"`、`""`・`"..."`・`"   "` → `"draw-my-map"`、`"旅行😀"` → `"旅行😀"`。
  - `createMapFileName("旅行/計画", "json", new Date(2026, 9, 21, 9, 5, 7))` → `"旅行_計画-20261021-090507.json"`。`png`・`svg` も同じ規則。
- [ ] `mapTimestamp.test.ts` を書く。ファイル冒頭で `process.env.TZ = "Asia/Tokyo";`（L-181）。
  - `formatMapUpdatedAt("2026-10-21T15:04:00.000Z")` → `"更新: 2026/10/22 00:04"`（UTC のまま組み立てると日付がずれて失敗する値）、`"2026-01-02T00:00:00.000Z"` → `"更新: 2026/01/02 09:00"`、`UNKNOWN_MAP_TIMESTAMP` → `"更新: 不明"`。
  - `normalizeMapTimestamp("2026-10-21T00:00:00.000Z")` → `{ value: 同じ, repaired: false }`、`"not a date"`・`123`・`null`・`undefined` → `{ value: UNKNOWN_MAP_TIMESTAMP, repaired: true }`（L-470）。
- [ ] RED: `npm test -- --runInBand mapName.test.ts mapFileName.test.ts mapTimestamp.test.ts`（モジュールが無いため失敗）。
- [ ] 実装する。`formatMapUpdatedAt` は `toLocaleString` を使わず `getFullYear` などの数値から組み立てる。`toSafeFileNameBase` は設計書の5手順をこの順で適用する。
- [ ] GREEN: 同じコマンド。続けて `cd client && npm run verify`。
- 知見: L-057、L-161、L-181、L-182、L-470。
- 完了条件: 3ファイルの全ケースが通り、verify が成功する。既存のコードは変えていない。

### Task 2: インデックスの型・デコード・更新・表示順

**Files**
- Create: `client/src/domain/mapLibrary/mapIndex.ts`
- Create: `client/src/domain/mapLibrary/__tests__/mapIndex.test.ts`

**Interfaces**
- Consumes: Task 1 の `normalizeStoredMapName`、`normalizeMapTimestamp`、`DEFAULT_MAP_NAME`。
- Produces:
  ```ts
  export const MAP_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
  export function isValidMapId(value: unknown): value is string;
  export type MapIndexEntry = { id: string; name: string; createdAt: string; updatedAt: string };
  export type MapIndexV1 = {
    version: 1;
    currentMapId: string;
    maps: MapIndexEntry[];          // 作成順。1件以上
    legacyCleanupPending: boolean;
  };
  export type MapIndexDecodeResult =
    | { kind: "ok"; index: MapIndexV1; repaired: boolean }
    | { kind: "corrupt" };
  export function decodeMapIndex(raw: string): MapIndexDecodeResult;
  export function encodeMapIndex(index: MapIndexV1): string; // JSON.stringify（整形しない）
  export function createMapIndexEntry(id: string, name: string, nowIso: string): MapIndexEntry;
  export function createSingleMapIndex(entry: MapIndexEntry, legacyCleanupPending: boolean): MapIndexV1;
  export function compareMapEntriesForDisplay(a: MapIndexEntry, b: MapIndexEntry): number;
  export function sortMapEntriesForDisplay(maps: readonly MapIndexEntry[]): MapIndexEntry[];
  export function findMapEntry(index: MapIndexV1, id: string): MapIndexEntry | null;
  export function selectNextMapAfterRemoval(index: MapIndexV1, removedId: string): MapIndexEntry | null;
  export type MapRemovalPreview = { target: MapIndexEntry; isCurrent: boolean; isLast: boolean; nextMap: MapIndexEntry | null }; // nextMap は isCurrent かつ isLast でないときだけ値を持つ
  export function describeMapRemoval(maps: readonly MapIndexEntry[], currentMapId: string, removedId: string): MapRemovalPreview | null; // id が無ければ null
  export function addMapEntry(index: MapIndexV1, entry: MapIndexEntry): MapIndexV1;      // 末尾へ追加し、現在の id にする
  export function setCurrentMap(index: MapIndexV1, id: string): MapIndexV1 | null;        // id が無ければ null
  export function renameMapEntry(index: MapIndexV1, id: string, name: string): MapIndexV1 | null;
  export function touchMapEntry(index: MapIndexV1, id: string, updatedAt: string): MapIndexV1 | null;
  export function removeMapEntry(index: MapIndexV1, id: string): MapIndexV1 | null;       // 残りが0件になる場合と id が無い場合は null。開いているマップなら現在の id を selectNextMapAfterRemoval の結果へ
  export function replaceLastMapEntry(index: MapIndexV1, removedId: string, replacement: MapIndexEntry): MapIndexV1 | null; // 1件だけのときに置き換えて現在の id にする
  export function withLegacyCleanupPending(index: MapIndexV1, pending: boolean): MapIndexV1;
  export function pickUnusedMapId(generateId: () => string, isUsed: (id: string) => boolean, maxAttempts?: number): string | null; // 既定10回。正規表現に合わない id も作り直す
  ```
- 表示順: 更新日時の新しい順 → 作成日時の新しい順 → id の昇順。日時は `Date.parse` の数値で比べる。
- 「削除後に開くマップ」の規則は、内部の1つの関数（`removedId` を除いた候補を表示順に並べた先頭）にまとめ、`selectNextMapAfterRemoval`・`removeMapEntry`・`describeMapRemoval` の3つがそれを使う。削除の確認の文言（Task 18）と実際の削除（Task 9）で、開くマップがずれないようにするため。

- [ ] `mapIndex.test.ts` を書く。
  - `decodeMapIndex` が `corrupt`: `"{"`、`"null"`、`"[]"`、`'"x"'`、`version: 2`、`maps` が配列でない、有効な項目が0件（`maps: [{ id: "bad id", name: "x" }]`）。
  - 項目の除外と補正: `id` が正規表現に合わない・文字列でない、`name` が文字列でない項目は除外。`name: ""` → `"無題のマップ"`、`name` が60コードポイント → 先頭50、`createdAt: "x"` → `UNKNOWN_MAP_TIMESTAMP`。いずれも `repaired: true`。
  - id の重複: `[{id:"a",name:"1"},{id:"a",name:"2"}]` → 最初の `"1"` だけ残り `repaired: true`。
  - `currentMapId` が一覧に無い・数値: 表示順の先頭にする。候補を3件（更新日時がすべて異なる）用意し、配列の先頭ではなく最新の更新日時の項目が選ばれることを確かめる（L-170）。
  - `legacyCleanupPending: "yes"` → `false`、`repaired: true`。
  - 正常な入力は `repaired: false` で、`encodeMapIndex` の結果を `decodeMapIndex` すると同じ値に戻る。
  - 表示順: 更新日時が同じで作成日時が異なる2件、両方同じで id が `"b"`・`"a"` の2件 → `"a"` が先。`UNKNOWN_MAP_TIMESTAMP` の項目は最後。
  - `selectNextMapAfterRemoval`: 3件 A（更新 10:00）・B（12:00）・C（11:00）で B を消すと C、A を消すと B。1件だけなら `null`。
  - `describeMapRemoval`: 同じ3件（配列の順は A, B, C、現在は B）で B → `{ isCurrent: true, isLast: false, nextMap: C }`、A → `{ isCurrent: false, isLast: false, nextMap: null }`。1件だけ → `{ isCurrent: true, isLast: true, nextMap: null }`。存在しない id → `null`。さらに、配列の順と表示順が異なるデータで、`describeMapRemoval(sortMapEntriesForDisplay(index.maps), index.currentMapId, id).nextMap?.id` と `removeMapEntry(index, id)?.currentMapId` が一致することを確かめる（L-170）。
  - `removeMapEntry`: 開いていない項目の削除で現在の id は変わらない。開いている項目の削除で次のマップが現在になる。1件だけなら `null`。入力のオブジェクトを変えない（`Object.freeze` した入力で確かめる）。
  - `replaceLastMapEntry`: 1件の index で新しい項目へ置き換わり、現在の id も新しい id。2件以上なら `null`。
  - `renameMapEntry`・`touchMapEntry`・`setCurrentMap`: 存在しない id で `null`。`renameMapEntry` は `updatedAt` を変えない。
  - `pickUnusedMapId`: 生成が `["a","a","b"]` の順で `isUsed("a") === true` → `"b"`。`"bad id"` を返す生成は作り直す。10回すべて使用済み → `null`。
- [ ] RED: `npm test -- --runInBand mapIndex.test.ts`。
- [ ] 実装する。`decodeMapIndex` は `JSON.parse` を try で囲み、`typeof` と `Array.isArray` で形を確かめる。スプレッドや `||` で欠損を埋めない（L-470）。
- [ ] GREEN と verify。
- 知見: L-002、L-170、L-182、L-470、L-576。
- 完了条件: 上の全ケースが通る。起動時の判定（Task 3）がこの `decodeMapIndex` の結果だけを使えるだけの情報（`repaired`）を返す。

### Task 3: 起動の計画（純関数）

**Files**
- Create: `client/src/domain/mapLibrary/mapLibraryStartup.ts`
- Create: `client/src/domain/mapLibrary/__tests__/mapLibraryStartup.test.ts`

**Interfaces**
- Consumes: Task 2 の `decodeMapIndex`、`createMapIndexEntry`、`createSingleMapIndex`、`sortMapEntriesForDisplay`、`withLegacyCleanupPending`、`pickUnusedMapId`、`MapIndexV1`。既存の `parseMapDocumentJsonWithVersion`、`serializeMapDocument`（`domain/persistence/mapDocumentCodec`）、`OperationNotice`。
- Produces:
  ```ts
  export type MapLibraryStartupSnapshot =
    | { kind: "unavailable" }
    | { kind: "available"; indexRaw: string | null; legacyRaw: string | null; bodyIds: readonly string[] };
  export type MapLibraryStartupDeps = { now: () => Date; generateId: () => string };
  export type ProtectedStartup = { mapId: string; initialJson: string | null; notice: OperationNotice };
  export type MapLibraryStartupPlan =
    | { kind: "protected"; protectedStartup: ProtectedStartup }
    | { kind: "open"; index: MapIndexV1 }
    | { kind: "cleanupLegacy"; index: MapIndexV1; cleanedIndex: MapIndexV1 }
    | { kind: "initialize"; index: MapIndexV1; notice: OperationNotice | null; onFailure: ProtectedStartup }
    | { kind: "migrate"; bodyId: string; bodyJson: string; index: MapIndexV1; onFailure: ProtectedStartup }
    | { kind: "rebuild"; corruptRaw: string; index: MapIndexV1; notice: OperationNotice; onFailure: ProtectedStartup };
  export function planMapLibraryStartup(snapshot: MapLibraryStartupSnapshot, deps: MapLibraryStartupDeps): MapLibraryStartupPlan;
  ```
- 新しい id は `pickUnusedMapId(deps.generateId, id => bodyIds.includes(id))` で選ぶ。`null` のときはその分岐の書き込み失敗と同じ保護モードの計画を返す。保護モードの `mapId` は `deps.generateId()` の値（どこにも書かない）。
- 日時は `deps.now().toISOString()`。

- [ ] `mapLibraryStartup.test.ts` を書く。設計書の「分岐ごとのインデックスと通知」の表の各行を1テストずつ、計画の種類・インデックスの値・通知の種類と文言で固定する。
  - `unavailable` → `protected`、`initialJson: null`、warning「ブラウザの保存領域を使えないため、このマップは保存されません。必要な場合はJSONで書き出してください。」
  - 正常なインデックス・`P: false` → `open`。旧キーがあっても `cleanupLegacy` にならない。
  - 正常なインデックス・`P: true` → `cleanupLegacy`、`cleanedIndex.legacyCleanupPending === false`。
  - 正常だが `repaired: true` のインデックス → `open`（書き込みの計画を作らない）。
  - インデックスも旧キーも無い → `initialize`、`maps` は「無題のマップ」1件、`P: false`、`notice: null`、`onFailure` は error「ブラウザに保存できないため、このマップは保存されません。必要な場合はJSONで書き出してください。」
  - 旧キーが V3 で読める → `migrate`。`bodyJson` は `serializeMapDocument` の出力で、ノードの id・座標・イラストがそのまま（L-456）。`index` は `P: true`、名前「無題のマップ」、`createdAt === updatedAt === now`。`onFailure.initialJson` は旧キーの生の文字列、error「以前の保存データを新しい形式へ移行できませんでした。この画面での変更は保存されません。必要な場合はJSONで書き出してください。」
  - 旧キーが V1 → `bodyJson` は V3（`"version":3`）。
  - 旧キーが壊れている（`"{"`）→ `initialize`、`P: false`、warning「以前の保存データを読み込めなかったため、空のマップで開始します。以前の保存データは消さずに残しています。」、`onFailure` は error「以前の保存データを読み込めず、ブラウザにも保存できないため、このマップは保存されません。以前の保存データは消さずに残しています。」
  - インデックスが壊れていて本体が `["b","a"]` → `rebuild`、`corruptRaw` は壊れた文字列、`maps` は id 昇順で「復元したマップ 1」（a）・「復元したマップ 2」（b）、現在は `a`、`P: false`、warning「マップの一覧を読み取れなかったため、保存済みのマップから一覧を作り直しました。マップ名は「復元したマップ」になっています。」、`onFailure` は error「マップの一覧を読み取れませんでした。保存データを守るため、この画面での変更は保存されません。」。`bodyIds` に正規表現に合わない id があれば除外する。
  - インデックスが壊れていて本体0件 → 旧キーが「読める」「無い」「壊れている」の3通りすべてで `rebuild`、「無題のマップ」1件、`P: false`、warning「マップの一覧を読み取れなかったため、空のマップで開始します。」。どの計画にも旧キーの書き込み・削除が無い（L-002、L-004）。
  - 生成した id が孤立した本体の id と一致する（`generateId` が `["orphan","new"]`、`bodyIds: ["orphan"]`）→ 初回起動と移行で `"new"` が使われる。10回とも一致 → `protected` と、その分岐の失敗時の通知。
  - 同じスナップショットと決定的な `deps` で2回呼ぶと同じ計画になる（純関数であること）。
- [ ] RED: `npm test -- --runInBand mapLibraryStartup.test.ts`。
- [ ] 実装する。インデックスの判定は `decodeMapIndex` の結果だけで行い、別の簡易判定を作らない（L-576）。移行の計画と旧キーの後始末の計画は同時に作らない。
- [ ] GREEN と verify。
- 知見: L-002、L-003、L-004、L-170、L-456、L-477、L-576。
- 完了条件: 表の全行と上のケースが通る。この関数は localStorage・`window`・`Date` を直接参照しない。旧キーのデコードは既存の `parseMapDocumentJsonWithVersion` だけで行い（V1〜V3 をそのまま読む。新しい解析関数や `JSON.parse` の直書きを作らない）、デコードに失敗した計画にも成功した計画にも、旧キーの書き込み・削除が含まれない（後始末は次の起動の `cleanupLegacy` だけ）ことを、テストで確かめている。

### Task 4: 保存サービスとテスト用の補助関数

**Files**
- Create: `client/src/services/persistence/mapLibraryStorage.ts`
- Create: `client/src/services/persistence/__tests__/mapLibraryStorage.test.ts`
- Modify: `client/src/services/persistence/mapStorage.ts`（`removeStoredMapJson` を追加。既存の関数はまだ消さない）
- Modify: `client/src/services/persistence/__tests__/mapStorage.test.ts`
- Create: `client/src/testing/mapLibraryTestStorage.ts`
- Create: `client/src/testing/__tests__/mapLibraryTestStorage.test.ts`

**Interfaces**
- Consumes: Task 2 の `MapIndexV1`、`encodeMapIndex`、`isValidMapId`、`decodeMapIndex`。Task 3 の `MapLibraryStartupSnapshot`。既存の `MapDocumentResult`、`MAP_STORAGE_KEY`、`readStoredMapJson`。
- Produces（`mapLibraryStorage.ts`）:
  ```ts
  export const MAP_INDEX_STORAGE_KEY = "draw-my-map.maps.v1";
  export const MAP_BODY_KEY_PREFIX = "draw-my-map.maps.v1.doc.";
  export const MAP_INDEX_BACKUP_STORAGE_KEY = "draw-my-map.maps.v1.corrupt-backup";
  export type MapLibraryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
  export type StorageWriteResult = { ok: true } | { ok: false; error: string };
  // 本体かインデックスの書き込みが容量不足のときのやり直し（failedStep: "retry"、legacy: "removed"）は、ローカルレビュー第12周の指摘1・第13周の指摘1で追加した。
  export type MigrationWriteResult =
    | { ok: true; legacy: "kept" }
    | { ok: true; legacy: "removed" }
    | { ok: false; failedStep: "body" }
    | { ok: false; failedStep: "index"; rollback: "removed" | "failed" }
    | { ok: false; failedStep: "retry"; legacy: "kept" | "restored" | "lost"; bodyRollback: "notNeeded" | "removed" | "failed" };
  export function mapBodyKey(id: string): string;
  export function getBrowserMapLibraryStorage(): MapLibraryStorage | null; // window.localStorage の取得が例外なら null
  export function readMapLibrarySnapshot(storage: MapLibraryStorage | null): MapLibraryStartupSnapshot;
  export function writeMapIndex(storage: MapLibraryStorage, index: MapIndexV1): StorageWriteResult;
  export function readMapBody(storage: MapLibraryStorage, id: string): MapDocumentResult<string | null>;
  export function writeMapBody(storage: MapLibraryStorage, id: string, json: string): StorageWriteResult;
  export function removeMapBody(storage: MapLibraryStorage, id: string): StorageWriteResult;
  export function hasMapBody(storage: MapLibraryStorage, id: string): boolean; // 読み取り例外は true（使用済みとして扱う）
  export function writeCorruptIndexBackup(storage: MapLibraryStorage, raw: string): StorageWriteResult;
  export function removeLegacyMap(storage: MapLibraryStorage): StorageWriteResult;
  export function writeMigratedMap(storage: MapLibraryStorage, input: { bodyId: string; bodyJson: string; index: MapIndexV1; retryIndex: MapIndexV1; legacyRaw: string }): MigrationWriteResult;
  ```
- Produces（`mapStorage.ts`）: `removeStoredMapJson(storage: Pick<Storage, "removeItem">): MapDocumentResult<void>`、`restoreStoredMapJson(storage: Pick<Storage, "setItem">, raw: string): MapDocumentResult<void>`（移行のやり直しが失敗したときの旧キーの書き戻し。ローカルレビュー第12周の指摘1で追加）。
- Produces（`client/src/testing/mapLibraryTestStorage.ts`。テスト専用。本体のコードから import しない）:
  ```ts
  export type SeedMap = { id?: string; name?: string; json: string | null; createdAt?: string; updatedAt?: string };
  // id の既定は "map-1"、"map-2"…、名前の既定は "マップ 1"…、日時の既定は "2026-01-01T00:00:00.000Z"。
  // json が null の項目は本体を書かない。currentMapId の既定は maps[0] の id。
  export function seedMapLibrary(storage: Storage, maps: readonly SeedMap[], options?: { currentMapId?: string; legacyCleanupPending?: boolean }): MapIndexV1;
  export function readActiveMapJson(storage: Storage): string | null;   // インデックスの currentMapId の本体。インデックスが無ければ null
  export function activeMapBodyKey(storage: Storage): string;           // インデックスが無ければ例外を投げる
  export type StorageOperation = { type: "setItem"; key: string; value: string } | { type: "removeItem"; key: string };
  export function createRecordingStorage(options?: {
    initial?: Record<string, string>;
    failSetItem?: (key: string, value: string) => boolean;
    failRemoveItem?: (key: string) => boolean;
    failGetItem?: boolean;
    beforeRemoveItem?: (key: string) => void;
  }): { storage: Storage; operations: StorageOperation[]; entries: () => Record<string, string> };
  ```
- `createRecordingStorage` は本物の `Storage` と同じく `length`・`key(i)`・`getItem` の `null`・`clear` を持ち、失敗させた書き込みは値を変えずに `DOMException("QuotaExceededError")` を投げる（L-171）。

- [ ] `mapLibraryStorage.test.ts` を書く（`createRecordingStorage` を使う）。
  - `mapBodyKey("abc")` → `"draw-my-map.maps.v1.doc.abc"`。
  - `readMapLibrarySnapshot`: `null` → `unavailable`。`failGetItem` → `unavailable`。インデックス・旧キー・本体2件・退避キー・関係ないキー（`"draw-my-map.map.v1"`、`"draw-my-map.maps.v1.corrupt-backup"`、`"draw-my-map.maps.v1.doc.bad id"`、`"other"`）がある状態で、`bodyIds` が正規表現に合う2件だけになる。
  - `writeMapIndex`・`writeMapBody`・`removeMapBody`・`writeCorruptIndexBackup`・`removeLegacyMap`: 成功で `{ ok: true }`、失敗で `{ ok: false }`、どれも例外を外へ投げない（L-056）。
  - `writeMigratedMap`: 成功で `operations` が `[setItem 本体, setItem インデックス]` の順。本体の書き込み失敗 → `failedStep: "body"`、インデックスを書かない。インデックスの書き込み失敗 → 本体を `removeItem` し `rollback: "removed"`、本体のキーが残らない。さらに `removeItem` も失敗 → `rollback: "failed"`（L-537）。
  - `hasMapBody`: 本体あり → `true`、なし → `false`、`failGetItem` → `true`。
- [ ] `mapStorage.test.ts` に `removeStoredMapJson` の成功・失敗のケースを足す。
- [ ] `mapLibraryTestStorage.test.ts` を書く。`seedMapLibrary` で2件（2件目は `json: null`）を書くと、インデックスの JSON が `decodeMapIndex` で `ok` かつ `repaired: false`、1件目の本体だけがある。`readActiveMapJson` が現在のマップの本体を返し、`currentMapId` を2件目にすると `null`。`activeMapBodyKey` がインデックスの無い Storage で例外を投げる。`createRecordingStorage` の `failSetItem` で値が変わらず例外が `QuotaExceededError` の名前を持つ。
- [ ] RED: `npm test -- --runInBand mapLibraryStorage.test.ts mapStorage.test.ts mapLibraryTestStorage.test.ts`。
- [ ] 実装する。すべての localStorage 操作を try で囲み、結果型で返す。
- [ ] GREEN と verify。
- 知見: L-001、L-004、L-056、L-171、L-476、L-537、L-539。
- 完了条件: `mapLibraryStorage.ts` 以外の新しいコードが localStorage を直接触らない。`Home` とページのテストは変わっていない。

### Task 5: セッションの型、id の生成、起動の実行、保護モードのセッション

**Files**
- Create: `client/src/types/mapStorageSession.ts`
- Create: `client/src/services/persistence/mapIdGenerator.ts`
- Create: `client/src/services/persistence/mapLibraryStartupRunner.ts`
- Create: `client/src/services/persistence/protectedStorageSession.ts`
- Create: `client/src/services/persistence/__tests__/mapIdGenerator.test.ts`
- Create: `client/src/services/persistence/__tests__/mapLibraryStartupRunner.test.ts`
- Create: `client/src/services/persistence/__tests__/protectedStorageSession.test.ts`

**Interfaces**
- Consumes: Task 3 の `planMapLibraryStartup`・`MapLibraryStartupDeps`・`ProtectedStartup`。Task 4 の `readMapLibrarySnapshot`、`writeMapIndex`、`writeMigratedMap`、`writeCorruptIndexBackup`、`removeLegacyMap`、`MapLibraryStorage`。Task 1 の `DEFAULT_MAP_NAME`。
- Produces（`types/mapStorageSession.ts`）:
  ```ts
  export type MapBodyWriteResult = { status: "saved" } | { status: "failed"; error: string } | { status: "inactive" };
  export type MapFlushResult = { status: "saved" } | { status: "unchanged" } | { status: "failed"; error: string };
  export type MapStorageSession = {
    mapId: string;
    readBody: () => MapDocumentResult<string | null>;
    writeBody: (json: string) => MapBodyWriteResult;
    registerFlush: (flush: () => MapFlushResult) => () => void;
  };
  ```
- Produces（`mapIdGenerator.ts`）: `generateMapId(source?: { randomUUID?: (() => string) | null; now?: () => number; random?: () => number }): string`。既定は `globalThis.crypto?.randomUUID`、`Date.now`、`Math.random`。`randomUUID` が無いときは `Date.now().toString(36)` と `Math.random().toString(36).slice(2, 10)` を `-` でつなぐ。
- Produces（`mapLibraryStartupRunner.ts`）:
  ```ts
  export type MapLibraryStartupResult =
    | { mode: "persistent"; index: MapIndexV1; notice: OperationNotice | null }
    | { mode: "protected"; mapId: string; mapName: string; initialJson: string | null; notice: OperationNotice };
  export function runMapLibraryStartup(storage: MapLibraryStorage | null, deps: MapLibraryStartupDeps): MapLibraryStartupResult;
  ```
  - `open` → 書かない。`cleanupLegacy` → `removeLegacyMap` が成功したら `writeMapIndex(cleanedIndex)`。両方成功したときだけ結果の `index` を `cleanedIndex` にし、それ以外は元の `index`。通知なし。
  - `initialize` → `writeMapIndex`。失敗で `onFailure` の保護モード。
  - `migrate` → `writeMigratedMap`。`ok: false` ならどの段階でも `onFailure` の保護モード（`initialJson` は旧キーの生の文字列）。ただし、やり直しで旧キーを書き戻せなかった（`legacy: "lost"`）ときは `onLegacyLost` の保護モード（JSON での書き出しを促す通知）。やり直しで成功した（`legacy: "removed"`）ときは `retryIndex`（`P: false`）で開く。
  - `rebuild` → `writeCorruptIndexBackup` → `writeMapIndex`。どちらかの失敗で `onFailure` の保護モード。
  - 保護モードの `mapName` は `DEFAULT_MAP_NAME`。
- Produces（`protectedStorageSession.ts`）: `createProtectedStorageSession(mapId: string, initialJson: string | null): MapStorageSession`。`readBody` は `{ ok: true, value: initialJson }`、`writeBody` は常に `{ status: "inactive" }`、`registerFlush` は何もしない解除関数を返す。

- [ ] `mapIdGenerator.test.ts`: `randomUUID` を渡すとその値。`randomUUID: null`、`now: () => 36 ** 3`、`random: () => 0.5` → `"1000-i"`（`(0.5).toString(36)` は `"0.i"`）。既定の呼び出しの結果が `isValidMapId` を満たす。
- [ ] `mapLibraryStartupRunner.test.ts`（`createRecordingStorage` と固定の `now`・`generateId`）:
  - 移行の成功: 旧キーだけの Storage → `persistent`、`operations` が `[setItem 本体, setItem インデックス]`、旧キーは残る、`P: true`。同じ Storage でもう一度実行 → 旧キーが `removeItem` され、インデックスが `P: false` で書かれ、本体は変わらない（2回目の起動）。
  - 移行の失敗: インデックスの書き込み失敗 → `protected`、`initialJson` が旧キーの文字列、本体のキーが残らない。本体の削除も失敗 → `protected`、本体は孤立した本体として残る（結果は同じ保護モード）。
  - 後始末の失敗: `removeItem` 失敗 → インデックスを書かない、結果の `index.legacyCleanupPending === true`。
  - 旧キーが壊れている（`"{"`）: インデックスの書き込みが成功する場合も失敗する場合も、`operations` に旧キーの `setItem`・`removeItem` が無く、`entries()` の旧キーが `"{"` のまま。V1 の旧キーの移行でも、旧キーは元の V1 の文字列のまま残る（L-477）。
  - 初回起動の失敗、破損の退避の失敗、破損のインデックスの書き込みの失敗 → それぞれ `protected` と表の文言。破損の退避が失敗した場合はインデックスを書かない（壊れたインデックスが元のまま）。
  - `storage` が `null` → `protected`、warning。
- [ ] `protectedStorageSession.test.ts`: 上の3つの振る舞い。`writeBody` の後も `readBody` は最初の値。
- [ ] RED: `npm test -- --runInBand mapIdGenerator.test.ts mapLibraryStartupRunner.test.ts protectedStorageSession.test.ts`。
- [ ] 実装し、GREEN と verify。
- 知見: L-001、L-002、L-477、L-537、L-545、L-576。
- 完了条件: 書き込みの結果を見てから次の書き込み・結果の状態を決めている。runner は `planMapLibraryStartup` 以外で分岐の判定をしない。旧キーが壊れている起動（`initialize` の成功・失敗の両方）と移行の失敗の後で、旧キーの値が起動前と同じ文字列のまま残っていることを `entries()` で確かめるテストがある（読めない旧データを消さない・書き換えない）。

### Task 6: 自動保存の保存先をセッションへ置き換える

**Files**
- Modify: `client/src/hooks/useMapStorageRestoration.ts`、`useMapStorageAutoSave.ts`、`useMapStoragePersistence.ts`、`useMapPersistence.ts`
- Modify: `client/src/hooks/__tests__/useMapStorageRestoration.test.tsx`、`useMapStorageAutoSave.test.tsx`、`useMapStoragePersistence.test.tsx`、`useMapPersistence.test.tsx`
- Create: `client/src/testing/createTestStorageSession.ts`
- Modify: `client/src/services/persistence/mapStorage.ts`（暫定の `createLegacyMapStorageSession` を追加）、`__tests__/mapStorage.test.ts`
- Modify: `client/src/app/page.tsx`（暫定配線）

**Interfaces**
- Consumes: Task 5 の `MapStorageSession`、`MapBodyWriteResult`。
- Produces:
  - `useMapStorageRestoration({ currentSnapshot, replaceMap, publishNotice, readBody: () => MapDocumentResult<string | null> })`。`storage` を削除。
  - `useMapStorageAutoSave({ currentSnapshot, hydrated, initialPersistedSnapshot, publishNotice, writeBody: (json: string) => MapBodyWriteResult })`。`storage` を削除。`failed` で `{ kind: "error", message: AUTO_SAVE_FAILURE_MESSAGE }` を通知、`inactive` は通知も最後に保存した内容の更新もしない。
  - `export const AUTO_SAVE_FAILURE_MESSAGE = "ブラウザへ自動保存できませんでした。不要なマップを削除するか、JSONで書き出してください。";`（`useMapStorageAutoSave.ts`）
  - `useMapStoragePersistence({ currentSnapshot, replaceMap, publishNotice, storageSession: MapStorageSession })`。
  - `useMapPersistence({ nodes, layoutMode, replaceMap, storageSession: MapStorageSession, downloadJson?, readFile? })`。`storage` を削除し `storageSession` を必須にする。
  - `client/src/testing/createTestStorageSession.ts`:
    ```ts
    export function createTestStorageSession(options?: { mapId?: string; initialJson?: string | null; readError?: string }): {
      session: MapStorageSession;
      writes: string[];                                         // 実際に保存した json の履歴
      setWriteOutcome: (outcome: "saved" | "failed" | "inactive") => void;
      registeredFlushCount: () => number;
      callRegisteredFlush: () => MapFlushResult;               // 登録が無ければ { status: "unchanged" }
    };
    ```
    `failed`・`inactive` のときは `writes` に積まない（本物と同じく書かない。L-171）。
  - 暫定: `createLegacyMapStorageSession(): MapStorageSession`（`mapStorage.ts`）。`mapId: "legacy"`、`readBody` は `window.localStorage` の取得を try で囲み（例外なら `{ ok: false, error: "ブラウザの保存データを読み取れませんでした。" }`）、取得できたら `readStoredMapJson`。`writeBody` も取得を try で囲み（例外なら `{ status: "failed", error: AUTO_SAVE_FAILURE_MESSAGE }`）、`writeStoredMapJson` の結果を `saved`・`failed` に変換、`registerFlush` は何もしない解除関数。Task 21 で削除する。`Home` は `const [storageSession] = useState(createLegacyMapStorageSession)` で `useMapPersistence` に渡す。

- [ ] 既存の4つのフックのテストを、`storage` の代わりに `createTestStorageSession` を渡す形へ書き換える。保存先のキーを見ていた期待値は `writes` の履歴で確かめる（L-419: 最後の値だけでなく履歴全体を見る）。
- [ ] 追加するケース:
  - 自動保存: `setWriteOutcome("failed")` で `AUTO_SAVE_FAILURE_MESSAGE` の error が1回通知され、次の変更で再試行する。`inactive` で通知されず、次の変更でも再試行する。
  - 復元: `readError` を設定したセッションで warning「保存データを復元できませんでした。空のマップで開始します。」、`initialJson: null` で通知なし。
  - `useMapPersistence`: `storageSession` の `readBody` の内容が復元される。
  - `mapStorage.test.ts`: `createLegacyMapStorageSession` の `readBody`・`writeBody` が旧キーを読み書きし、書き込みの例外で `failed` を返す。
  - `mapStorage.test.ts`: `Object.defineProperty(window, "localStorage", { configurable: true, get: () => { throw new Error("denied"); } })` で `window.localStorage` の取得自体が例外を投げる状態にすると、`readBody()` が例外を投げずに `{ ok: false }` を返し、`writeBody("x")` が例外を投げずに `{ status: "failed" }` を返す（テストの後で元のプロパティに戻す）。`useMapPersistence.test.tsx` にも、この状態で `Home` 相当の描画をしても effect の外へ例外が漏れず、復元の warning が出て、自動保存の失敗が `AUTO_SAVE_FAILURE_MESSAGE` で通知されるケースを足す（既存の「localStorage プロパティの取得で例外が出ても effect の外へ漏らさない」保証を残す）。
- [ ] RED: `npm test -- --runInBand useMapStorageRestoration.test.tsx useMapStorageAutoSave.test.tsx useMapStoragePersistence.test.tsx useMapPersistence.test.tsx mapStorage.test.ts`（型の不一致・新しい期待で失敗）。
- [ ] 実装する。`useMapStorageAutoSave` と `useMapStorageRestoration` から `window.localStorage` の参照を消す。
- [ ] GREEN。ページのテスト（旧キーのまま）も `npm test -- --runInBand page` で通ることを確かめ、verify。
- 知見: L-001、L-002、L-060、L-171、L-419、L-476。
- 完了条件: フックが localStorage を直接参照しない。`storageSession` が必須。ページの挙動は変わらない（文言の変更を除く）。暫定のレガシーセッションは `Home` からだけ使う。

### Task 7: flush と保存失敗の通知の解除

**Files**
- Modify: `client/src/hooks/useMapStorageAutoSave.ts`、`useMapStoragePersistence.ts`、`useMapPersistence.ts`
- Modify: `client/src/hooks/__tests__/useMapStorageAutoSave.test.tsx`、`useMapStoragePersistence.test.tsx`、`useMapPersistence.test.tsx`

**Interfaces**
- Consumes: Task 6 のフックと `createTestStorageSession`、Task 5 の `MapFlushResult`。
- Produces:
  - `useMapStorageAutoSave({ ..., writeBody, clearSaveFailureNotice: () => void })` → `{ requestSnapshotSave: (snapshot: string) => void; flushPendingSave: () => MapFlushResult }`。
    - `hydrated === false` → `unchanged`、何も書かない。
    - 保存待ちのタイマーを取り消す。最新の `currentSnapshot`（`useLayoutEffect` で同期する ref）が最後に保存した内容と異なるか、強制保存の要求が残っているときだけ `writeBody` を同期で呼ぶ。`saved` → 最後に保存した内容を更新し、強制保存の要求を消し、`clearSaveFailureNotice()` を呼んで `saved`。`failed` → `failed`（通知は出さない。呼び出し元が通知する）。`inactive` → `unchanged`。
    - `flushPendingSave` は ref だけを読む安定した関数にする。
  - `useMapStoragePersistence({ ..., storageSession, clearSaveFailureNotice })` は `useLayoutEffect` で `storageSession.registerFlush(flushPendingSave)` を呼び、cleanup で解除する。戻り値に `flushPendingSave` を含める。
  - `useMapPersistence` は `clearSaveFailureNotice` を `useCallback(() => setNotice((current) => current?.kind === "error" && current.message === AUTO_SAVE_FAILURE_MESSAGE ? null : current), [])` で作って渡す（関数形式の更新。L-453）。
  - アンマウントでは今までどおりタイマーを破棄するだけで書かない。

- [ ] テストを足す（偽のセッションと fake timers）。
  - 変更後300ms未満で `flushPendingSave()` → `saved`、`writes` に最新の内容が1回だけ、その後300ms進めても追加の書き込みが無い（L-419）。
  - 変更が無い → `unchanged`、書き込みなし。復元前（`hydrated: false`）→ `unchanged`。
  - `failed` → `failed`、通知なし、タイマーも取り消されている。`inactive` → `unchanged`。
  - `requestSnapshotSave` の直後の flush は同じ内容でも書く。
  - レンダー中ではなく layout effect の後の最新の内容を書く（rerender 直後に flush して新しい内容が書かれる）。
  - `useMapStoragePersistence`: マウントで `registeredFlushCount() === 1`、アンマウントで 0、`callRegisteredFlush()` が保存待ちを書く。
  - 壊れた本体の保護（L-002）: `createTestStorageSession({ initialJson: "{" })` を渡して描画すると、復元の warning が出て空のマップになる。その後、変更をせずに `flushPendingSave()`（と `callRegisteredFlush()`）を呼ぶと `{ status: "unchanged" }` を返し、`writes` が空のまま（壊れた本体を空のマップで上書きしない）。続けて300ms進めても `writes` は空。
  - `useMapPersistence`: 自動保存の失敗の通知が出ている状態で flush が `saved` → 通知が `null`。JSON 読み込みの通知（「マップを読み込みました。」）が出ている状態で flush が `saved` → 通知は残る。
- [ ] RED: `npm test -- --runInBand useMapStorageAutoSave.test.tsx useMapStoragePersistence.test.tsx useMapPersistence.test.tsx`。
- [ ] 実装し、GREEN と verify。
- 知見: L-002、L-419、L-453、L-468、L-521。
- 完了条件: flush の7通り（保存待ちあり・なし・復元前・失敗・`inactive`・タイマーの取り消し・本体の復元に失敗した後の未変更）がテストで固定されている。レンダー中に ref を書いていない。

### Task 8: useMapLibrary（起動・作成・切り替え・名前変更・セッション）

**Files**
- Create: `client/src/domain/mapLibrary/mapLibraryMessages.ts`
- Create: `client/src/domain/mapLibrary/__tests__/mapLibraryMessages.test.ts`
- Create: `client/src/hooks/useMapLibrary.ts`
- Create: `client/src/hooks/__tests__/useMapLibrary.test.tsx`

**Interfaces**
- Consumes: Task 1〜5 のすべて（`validateMapNameInput`、`mapIndex.ts` の更新関数、`runMapLibraryStartup`、`readMapBody`・`writeMapBody`・`writeMapIndex`・`hasMapBody`、`createProtectedStorageSession`、`MapStorageSession`）。
- Produces（`mapLibraryMessages.ts`。文言は設計書の「通知の文言」の表のとおり）:
  ```ts
  export type MapLibraryOperationName = "マップを作成" | "マップを切り替え" | "名前を変更" | "マップを削除";
  export function mapCreatedNotice(name: string): OperationNotice;            // status
  export function mapSwitchedNotice(name: string): OperationNotice;           // status
  export function mapRenamedNotice(name: string): OperationNotice;            // status
  export function mapDeletedNotice(name: string): OperationNotice;            // status
  export function currentMapDeletedNotice(name: string, nextName: string): OperationNotice;
  export function lastMapDeletedNotice(name: string): OperationNotice;
  export function switchFlushFailedNotice(): OperationNotice;                 // error
  export function createFlushFailedNotice(): OperationNotice;                 // error
  export function indexWriteFailedNotice(operation: MapLibraryOperationName): OperationNotice; // error
  export function bodyRemovalFailedNotice(name: string): OperationNotice;                     // warning
  export function currentBodyRemovalFailedNotice(name: string, nextName: string): OperationNotice;
  export function lastBodyRemovalFailedNotice(name: string): OperationNotice;
  export function mapIdUnavailableNotice(): OperationNotice;                  // error
  ```
- Produces（`useMapLibrary.ts`）:
  ```ts
  export type MapLibraryDeps = {
    getStorage: () => MapLibraryStorage | null;
    now: () => Date;
    generateId: () => string;
  };
  export type MapLibraryView =
    | { status: "loading" }
    | {
        status: "ready";
        storageMode: "persistent" | "protected";
        maps: readonly MapIndexEntry[];          // 表示順
        currentMap: MapIndexEntry;
        storageSession: MapStorageSession;
        startupNotice: OperationNotice | null;
      };
  export type MapLibraryOperationResult =
    | { ok: true; remounted: boolean; notice: OperationNotice | null; saveRetryNotice: OperationNotice | null }
    | { ok: false; notice: OperationNotice };
  export type UseMapLibraryResult = {
    view: MapLibraryView;
    createMap: (nameInput: string) => MapLibraryOperationResult;
    switchMap: (id: string) => MapLibraryOperationResult;
    renameMap: (id: string, nameInput: string) => MapLibraryOperationResult;
    deleteMap: (id: string) => MapLibraryOperationResult; // Task 8 では未実装の id に対して呼ばれない。Task 9 で実装する
  };
  export function useMapLibrary(deps: MapLibraryDeps): UseMapLibraryResult;
  ```
  Task 8 の `deleteMap` は、`indexWriteFailedNotice("マップを削除")` を返して何もしない実装にしておき、Task 9 で置き換える（UI からはまだ呼ばれない）。
- 状態: 起動の結果、インデックス（persistent のとき）、セッション番号、保護モードのセッション。`indexRef`・`sessionNumberRef` は操作の中で次の値を計算したときと `useLayoutEffect` で同期する。
- 起動: `startupRef = useRef<MapLibraryStartupResult | null>(null)`。`useEffect` で `startupRef.current === null` のときだけ `runMapLibraryStartup(deps.getStorage(), deps)` を実行し、その後 ref の結果から state を設定する。cleanup は持たない（L-469）。
- セッション: `useMemo` で `(currentMapId, sessionNumber)` ごとに新しいオブジェクトを作る。`writeBody` は作られたときの `mapId` とセッション番号を閉じ込め、`sessionNumberRef.current` と一致し `indexRef.current` に `mapId` があるときだけ `writeMapBody` → 成功で `touchMapEntry(indexRef.current, mapId, now)` を `writeMapIndex`（成功したときだけ ref と state を更新。失敗しても `saved`）。条件を満たさなければ `inactive`。
- flush の登録: `{ session: number; flush }` を ref に持ち、現在のセッション番号の登録だけを呼ぶ。登録が無ければ `unchanged`。解除は自分の登録のときだけ消す。
- `createMap`: 名前の検証（失敗は `{ ok: false, notice: error(validation.message) }`）→ flush（`failed` → `createFlushFailedNotice()`）→ `pickUnusedMapId(generateId, id => インデックスにある || hasMapBody(storage, id))`（`null` → `mapIdUnavailableNotice()`）→ `addMapEntry` → `writeMapIndex`（失敗 → `indexWriteFailedNotice("マップを作成")`）→ ref・セッション番号・state を更新 → `{ ok: true, remounted: true, notice: mapCreatedNotice(name) }`。本体は書かない。
- `switchMap`: 現在の id なら `{ ok: true, remounted: false, notice: null }`。flush（`failed` → `switchFlushFailedNotice()`）→ `setCurrentMap` → `writeMapIndex`（失敗 → `indexWriteFailedNotice("マップを切り替え")`）→ 更新 → `mapSwitchedNotice`。
- `renameMap`: 検証 → 正規化した名前が今と同じなら書かずに `{ ok: true, remounted: false, notice: null }` → `renameMapEntry` → `writeMapIndex`（失敗 → `indexWriteFailedNotice("名前を変更")`）→ `mapRenamedNotice`。flush しない。
- 保護モードでは `createMap`・`switchMap`・`renameMap` は呼ばれない前提だが、呼ばれたら `indexWriteFailedNotice` を返して何もしない。

- [ ] `mapLibraryMessages.test.ts`: 各関数の種類と文言を設計書の表どおりに固定する。
- [ ] `useMapLibrary.test.tsx`（`createRecordingStorage`、固定の `now`、配列から順に返す `generateId`。日時はUTCの文字列で比べる）:
  - 初回の描画直後に `status: "loading"` にならず、effect の後に `ready`（RTL の `renderHook` は effect まで実行する）。インデックスの無い Storage でインデックスが1回だけ書かれる。
  - StrictMode で包んだ `renderHook` で、旧キーだけの Storage を起動 → `operations` に本体・インデックスの書き込みが1回ずつ、旧キーの `removeItem` が無い、`startupNotice` は `null`。破損したインデックスでは warning の `startupNotice` が残る（L-469）。
  - 作成: 書き込みの履歴がインデックスだけ（本体なし）、`currentMap` が新しいマップ、`storageSession.mapId` が新しい id、結果が `remounted: true` と作成の通知。flush の登録が `failed` を返すと結果が `createFlushFailedNotice()` でインデックスを書かない。インデックスの書き込み失敗で `view` が変わらない（L-545）。孤立した本体の id を生成した場合は作り直す。
  - 切り替え: flush → インデックスの順に書かれる（登録した flush の中で `writeBody` を呼ぶ偽物を使い、`operations` の順を確かめる）。現在のマップを選ぶと何も書かない。
  - A → B → A: 最初の A の `storageSession` を保持しておき、2回目の A になった後でその `writeBody("x")` を呼ぶと `inactive` で何も書かれない。現在の A のセッションの `writeBody` は `saved`（L-571、L-103）。
  - `writeBody` の成功でインデックスの `updatedAt` だけが `now` になり、名前変更と切り替えでは変わらない。インデックスの書き込みが失敗しても `saved`。
  - 同じ act の中で `writeBody` と `renameMap` を続けて呼ぶと、インデックスに両方（新しい `updatedAt` と新しい名前）が残る（L-453）。
  - 名前変更: 同じ名前（前後の空白だけ違う）なら何も書かない。51文字は `ok: false` で書かない。
  - 保護モード（`getStorage` が `null`）: `storageMode: "protected"`、`storageSession.writeBody` が `inactive`、`readBody` が `null`。
- [ ] RED: `npm test -- --runInBand mapLibraryMessages.test.ts useMapLibrary.test.tsx`。
- [ ] 実装し、GREEN と verify。
- 知見: L-001、L-103、L-171、L-453、L-468、L-469、L-521、L-545、L-571。
- 完了条件: 上のケースが通る。localStorage へは Task 4 の関数だけで触れる。

### Task 9: useMapLibrary（削除）

**Files**
- Modify: `client/src/hooks/useMapLibrary.ts`
- Modify: `client/src/hooks/__tests__/useMapLibrary.test.tsx`

**Interfaces**
- Consumes: Task 8 の `useMapLibrary`、`mapLibraryMessages.ts`。Task 2 の `removeMapEntry`、`replaceLastMapEntry`、`selectNextMapAfterRemoval`。Task 4 の `removeMapBody`。
- Produces: `deleteMap(id: string): MapLibraryOperationResult` の本実装。
  - 開いていない別のマップ: flush しない → `removeMapEntry` → `writeMapIndex`（失敗 → `indexWriteFailedNotice("マップを削除")`）→ ref と state を更新 → `removeMapBody`（失敗 → `notice: bodyRemovalFailedNotice(name)`、成功 → `mapDeletedNotice(name)`）→ 現在のマップの flush を再試行（`failed` → `saveRetryNotice: { kind: "error", message: AUTO_SAVE_FAILURE_MESSAGE }`、`saved`・`unchanged` → `null`）。`remounted: false`。
  - 開いているマップ（ほかにマップがある）: flush しない → `removeMapEntry`（現在の id は次のマップ）→ `writeMapIndex`（失敗 → 中止。開いたまま、保存待ちも残る）→ `sessionNumberRef` を進める → `removeMapBody` → state を更新 → `remounted: true`、`currentMapDeletedNotice(name, next.name)` または `currentBodyRemovalFailedNotice(name, next.name)`。
  - 最後の1つ: `pickUnusedMapId`（`null` → `mapIdUnavailableNotice()`）→ `replaceLastMapEntry(index, id, createMapIndexEntry(newId, DEFAULT_MAP_NAME, now))` → `writeMapIndex` → セッション番号を進める → `removeMapBody` → `remounted: true`、`lastMapDeletedNotice(name)` または `lastBodyRemovalFailedNotice(name)`。
  - 存在しない id → `indexWriteFailedNotice("マップを削除")` を返して何もしない。

- [ ] テストを足す（`createRecordingStorage`）。
  - 3件（A 開いている、B、C）で B を削除: `operations` が `[setItem インデックス, removeItem 本体B]` の順、現在は A のまま、`remounted: false`、`mapDeletedNotice("B")`。
  - B の本体の削除失敗: インデックスからは消え、本体は残り、通知は warning だけ（成功の status を重ねない。L-249）。
  - 開いていないマップの削除の後の再試行: 登録した flush が `saved` を返す偽物で `saveRetryNotice: null`、`failed` で `AUTO_SAVE_FAILURE_MESSAGE` の error。flush は削除の前ではなく後に呼ばれる（呼び出し時点でインデックスから B が消えている）。
  - 開いている A を削除（B 12:00、C 11:00 更新）: 次は B（L-170）。`beforeRemoveItem` の中で A の旧セッションの `writeBody("late")` を呼ぶと `inactive` で、本体 A が書き戻されない（セッション番号が本体の削除より先に進む）。`remounted: true`、`currentMapDeletedNotice("A", "B")`。
  - 開いているマップの削除でインデックスの書き込み失敗: `view` が変わらず、A の旧セッションの `writeBody` はまだ `saved`。
  - 最後の1つの削除: 新しい「無題のマップ」が現在になり、本体は書かれない。`lastMapDeletedNotice`。新しい id が孤立した本体の id と一致する場合は作り直す。
  - 削除で flush 用の登録が呼ばれないこと（開いているマップ・最後の1つ）。
- [ ] RED: `npm test -- --runInBand useMapLibrary.test.tsx`。
- [ ] 実装し、GREEN と verify。
- 知見: L-003、L-004、L-170、L-249、L-537、L-545、L-571。
- 完了条件: 削除の3通りと失敗時の扱いが設計書の「操作ごとの順序」の表どおり。

### Task 10: ショートカットの停止（履歴・ノード操作・`F`）

**Files**
- Modify: `client/src/components/map/useMapHistoryShortcuts.ts`、`useNodeKeyboardShortcuts.ts`、`useMapViewportShortcut.ts`
- Modify: `client/src/components/map/__tests__/useMapHistoryShortcuts.test.tsx`、`useNodeKeyboardShortcuts.test.tsx`、`useMapViewportShortcut.test.tsx`
- Modify: `client/src/components/map/MapStage.tsx`（呼び出しに `enabled: true` を暫定で渡す）、`client/src/app/page.tsx`（`useMapHistoryShortcuts({ undo, redo, enabled: true })` を暫定で渡す）

**Interfaces**
- Produces: 3つのフックの引数に必須の `enabled: boolean` を追加する。
  - `useMapHistoryShortcuts({ undo, redo, enabled }: { undo: () => boolean; redo: () => boolean; enabled: boolean })`
  - `useNodeKeyboardShortcuts({ ...既存, enabled: boolean })`
  - `useMapViewportShortcut({ ...既存, enabled: boolean })`
  - `enabled` は `useLayoutEffect` で同期する ref から読む。window への登録は今までどおり1回。`false` のときハンドラは何もせずに戻る（`preventDefault` もしない）。
  - `MapStage` と `Home` の `true` は暫定で、Task 12 と Task 20 で props から渡す値に置き換える。

- [ ] 各フックのテストに足す（L-173: 3つすべてに同じケース）。
  - `enabled: false` で、対象のキー（Ctrl/Cmd+Z・Ctrl+Y／Tab・Enter・Delete／`F`）を body から送ると、コールバックが呼ばれず、イベントの `defaultPrevented` が `false`。
  - `enabled` を `false` → `true` に rerender すると、同じキーで動く。リスナーの登録回数が増えない（`addEventListener` の spy で1回）。
- [ ] RED: `npm test -- --runInBand useMapHistoryShortcuts.test.tsx useNodeKeyboardShortcuts.test.tsx useMapViewportShortcut.test.tsx`。
- [ ] 実装し、GREEN と verify。
- 知見: L-173、L-521。
- 完了条件: 3つのフックが `enabled` を必須で受け取る。既存のテストは `enabled: true` を足すだけで通る。

### Task 11: ショートカットの停止（クリップボード・メニューを閉じる操作）

**Files**
- Modify: `client/src/components/map/useMapClipboardEvents.ts`、`useNodeContextMenuDismissal.ts`、`useNodeContextMenu.ts`
- Modify: `client/src/components/map/__tests__/useMapClipboardEvents.test.tsx`、`useNodeContextMenuDismissal.test.tsx`、`useNodeContextMenu.test.tsx`
- Modify: `client/src/components/map/MapStage.tsx`（暫定で `true` を渡す）

**Interfaces**
- Produces:
  - `useMapClipboardEvents({ ...既存, enabled: boolean })`
  - `useNodeContextMenuDismissal(isOpen: boolean, onDismiss: () => void, enabled: boolean): void`
  - `useNodeContextMenu({ nodes, visibleNodeIds, resetRevision, viewport, shortcutsEnabled: boolean })`。`useNodeContextMenuDismissal(isOpen, close, shortcutsEnabled)` を呼ぶ。
  - 読み方と停止時の振る舞いは Task 10 と同じ。入力欄の中のコピー・貼り付け・取り消しはブラウザの既定のまま妨げない。

- [ ] テストを足す（L-173）。
  - クリップボード: `enabled: false` で `copy`・`paste` イベントを document に送ると `copySubtree`・`pasteSubtree`・`publishNotice` が呼ばれず、`defaultPrevented` が `false`。
  - メニューを閉じる操作: `enabled: false` で Escape・外側の `pointerdown` を送っても `onDismiss` が呼ばれない。
  - `useNodeContextMenu`: `shortcutsEnabled: false` で開いたメニューが Escape で閉じない。
  - いずれも `true` に戻すと動き、登録が1回のまま。
- [ ] RED: `npm test -- --runInBand useMapClipboardEvents.test.tsx useNodeContextMenuDismissal.test.tsx useNodeContextMenu.test.tsx`。
- [ ] 実装し、GREEN と verify。
- 知見: L-173、L-521。
- 完了条件: 5つの window 登録のフックすべてが停止できる。

### Task 12: MapStage へ shortcutsEnabled を通す

**Files**
- Modify: `client/src/components/map/MapStage.tsx`
- Modify: `client/src/components/map/__tests__/MapStage.test.tsx`、`MapStageContextMenu.test.tsx`、`MapStageHistory.test.tsx`、`MapStageVisibility.test.tsx`
- Modify: `client/src/components/map/testing/AutoLayoutMapStageHarness.tsx`
- Modify: `client/src/app/page.tsx`（`shortcutsEnabled={true}` を暫定で渡す）

**Interfaces**
- Consumes: Task 10・11 のフックの `enabled`・`shortcutsEnabled`。
- Produces: `MapStageProps` に必須の `shortcutsEnabled: boolean` を追加し、`useMapViewportShortcut`・`useNodeKeyboardShortcuts`・`useMapClipboardEvents`・`useNodeContextMenu` へ渡す（Task 10・11 の暫定の `true` を置き換える）。

- [ ] `MapStage.test.tsx` に、`shortcutsEnabled={false}` で選択ノードがある状態の Tab・Delete・`F`・`copy` が `onAddChildNode`・`onDeleteNode`・ビューポートの移動・`onCopySubtree` を呼ばないこと、`true` に rerender すると動くことを足す。`MapStageContextMenu.test.tsx` に、`false` のとき開いているメニューが Escape で閉じないことを足す。
- [ ] 既存の各 `<MapStage>` の描画（`defaultProps` を含む）と `AutoLayoutMapStageHarness` に `shortcutsEnabled` を渡す。
- [ ] RED: `npm test -- --runInBand MapStage.test.tsx MapStageContextMenu.test.tsx`。
- [ ] 実装し、GREEN と verify。
- 知見: L-060、L-173。
- 完了条件: `MapStage` から4つのフックへ同じ値が渡り、`shortcutsEnabled` が必須。

### Task 13: JSON のファイル名にマップ名を使う

**Files**
- Modify: `client/src/services/persistence/mapJsonDownload.ts`、`__tests__/mapJsonDownload.test.ts`
- Modify: `client/src/hooks/useMapJsonExport.ts`、`useMapFilePersistence.ts`、`useMapPersistence.ts`
- Modify: `client/src/hooks/__tests__/useMapJsonExport.test.tsx`、`useMapFilePersistence.test.tsx`、`useMapPersistence.test.tsx`
- Modify: `client/src/app/page.tsx`（`mapName: DEFAULT_MAP_NAME` を暫定で渡す）、`client/src/app/__tests__/page.test.tsx`（`downloadMapJson` の呼び出しの期待値）

**Interfaces**
- Consumes: Task 1 の `createMapFileName`、`DEFAULT_MAP_NAME`。
- Produces:
  - `createMapJsonFileName(mapName: string, now: Date): string`（`createMapFileName(mapName, "json", now)` を使う）
  - `downloadMapJson(json: string, mapName: string, now = new Date()): void`
  - `useMapJsonExport({ currentSnapshot, mapName: string, publishNotice, downloadJson?: (json: string, mapName: string) => void })`
  - `useMapFilePersistence({ ..., mapName: string, downloadJson?: (json: string, mapName: string) => void })`
  - `useMapPersistence({ ..., mapName: string, downloadJson?: (json: string, mapName: string) => void })`
  - `Home` の暫定の `DEFAULT_MAP_NAME` は Task 20 で `MapEditor` の props の `mapName` に置き換える。

- [ ] テストを書き換える・足す。
  - `createMapJsonFileName("旅行", new Date(2026, 9, 21, 9, 5, 7))` → `"旅行-20261021-090507.json"`。`"a/b"` → `"a_b-..."`。`""` → `"draw-my-map-..."`。
  - `useMapJsonExport`: `downloadJson` が `(json, "旅行")` で呼ばれる。rerender で `mapName` を変えると次の書き出しに新しい名前が使われる。
  - `useMapFilePersistence`・`useMapPersistence`: `mapName` が `downloadJson` まで届く（L-060）。
  - `page.test.tsx` の `downloadMapJson` の期待値に第2引数 `"無題のマップ"` を足す。モックが第2引数を落としている場合は `(json: string, mapName: string) => mockDownloadMapJson(json, mapName)` にする。
- [ ] RED: `npm test -- --runInBand mapJsonDownload.test.ts useMapJsonExport.test.tsx useMapFilePersistence.test.tsx useMapPersistence.test.tsx`。
- [ ] 実装し、GREEN と verify。
- 知見: L-060、L-161。
- 完了条件: JSON の内容は変わらず、ファイル名だけが `<安全な名前>-YYYYMMDD-HHmmss.json` になる。

### Task 14: 画像のファイル名にマップ名を使う

**Files**
- Modify: `client/src/services/imageExport/mapImageFileName.ts`、`__tests__/mapImageFileName.test.ts`
- Modify: `client/src/hooks/useMapSvgExport.ts`、`useMapPngExport.ts`、`useMapImageExport.ts`
- Modify: `client/src/hooks/__tests__/useMapSvgExport.test.tsx`、`useMapPngExport.test.tsx`、`useMapImageExport.test.tsx`
- Modify: `client/src/app/page.tsx`（`mapName: DEFAULT_MAP_NAME` を暫定で渡す）

**Interfaces**
- Consumes: Task 1 の `createMapFileName`。
- Produces:
  - `createMapImageFileName(extension: "svg" | "png", mapName: string, now = new Date()): string`
  - `useMapSvgExport({ nodes, mapName: string, publishNotice, createSvgExport?, downloadSvg? })`
  - `useMapPngExport({ nodes, mapName: string, publishNotice, createSvgExport?, rasterizePng?, downloadPng? })`。書き出しを始めた時点の `mapName` を `await` の前に変数へ取っておき、それを使う。
  - `useMapImageExport({ nodes, mapName: string, ... })`

- [ ] テストを書き換える・足す。
  - `createMapImageFileName("png", "旅行", new Date(2026, 9, 21, 9, 5, 7))` → `"旅行-20261021-090507.png"`、`"svg"` も同じ。`"CON"` → `"_CON-..."`。
  - 既存の `/^draw-my-map-\d{8}-\d{6}\.(png|svg)$/` の期待を、マップ名を渡す形（`/^旅行-\d{8}-\d{6}\.png$/`）に変える。
  - PNG: ラスタライズを保留中に `mapName` を `"新しい名前"` へ rerender してから解決すると、ファイル名は開始時の `"旅行"`。
  - `useMapImageExport`: `mapName` が SVG・PNG の両方へ届く（L-060）。
- [ ] RED: `npm test -- --runInBand mapImageFileName.test.ts useMapSvgExport.test.tsx useMapPngExport.test.tsx useMapImageExport.test.tsx`。
- [ ] 実装し、GREEN と verify。
- 知見: L-060、L-161。
- 完了条件: JSON・PNG・SVG が同じ `createMapFileName` の規則を使う。

### Task 15: アンマウント後の非同期結果を捨てる

**Files**
- Modify: `client/src/hooks/useMapJsonImport.ts`、`useMapPngExport.ts`
- Modify: `client/src/hooks/__tests__/useMapJsonImport.test.tsx`、`useMapPngExport.test.tsx`

**Interfaces**
- Produces: 両方のフックに `mountedRef` を追加する。effect の中で `true` にし、cleanup で `false` に戻す（StrictMode の二重実行で `false` のまま残らない。L-469）。
  - `useMapJsonImport`: `await readFile(file)` の後（成功・例外の両方の経路）で `mountedRef.current` が `false` なら、`replaceMap`・`requestSnapshotSave`・`publishNotice` を呼ばずに戻る。
  - `useMapPngExport`: `await rasterizePng(...)` の後（成功・例外の両方）で `false` なら、ダウンロードと通知をせずに戻る。`finally` の `setIsExportingPng(false)` はアンマウント後は呼ばない。
  - シグネチャは変えない。

- [ ] テストを足す。
  - JSON: 保留した `readFile` の Promise があるうちに `unmount()` → 解決（成功・失敗・例外の3通り）しても `replaceMap`・`requestSnapshotSave`・`publishNotice` が呼ばれない。
  - PNG: 保留した `rasterizePng` があるうちに `unmount()` → 解決・拒否しても `downloadPng`・`publishNotice` が呼ばれない。
  - StrictMode で包んだ描画で、アンマウントしていなければ従来どおり結果が反映される（印が `false` のまま残っていない）。
- [ ] RED: `npm test -- --runInBand useMapJsonImport.test.tsx useMapPngExport.test.tsx`。
- [ ] 実装し、GREEN と verify。
- 知見: L-037、L-103、L-469。
- 完了条件: 再マウントの前に始めた JSON 読み込みと PNG 書き出しの結果が、新しいエディタにも利用者にも届かない。

### Task 16: ヘッダーのマップ操作とシェルの通知領域

**Files**
- Create: `client/src/components/layout/MapLibraryControls.tsx`、`__tests__/MapLibraryControls.test.tsx`
- Create: `client/src/components/layout/MapLibraryNoticeRegion.tsx`、`__tests__/MapLibraryNoticeRegion.test.tsx`
- Modify: `client/src/components/layout/AppHeader.tsx`、`__tests__/AppHeader.test.tsx`
- Modify: `client/src/app/page.tsx`（`mapControls={null}` を暫定で渡す）

**Interfaces**
- Produces:
  ```ts
  type MapLibraryControlsProps = {
    mapName: string;
    disabled: boolean;                       // 保護モード
    listExpanded: boolean;                   // ダイアログが一覧を表示中か
    onOpenList: () => void;
    onOpenCreate: () => void;
    listButtonRef: Ref<HTMLButtonElement>;
    createButtonRef: Ref<HTMLButtonElement>;
  };
  export function MapLibraryControls(props: MapLibraryControlsProps);

  export type ShellNotice = { sequence: number; notice: OperationNotice };
  export function MapLibraryNoticeRegion({ notice }: { notice: ShellNotice | null });
  ```
  - `MapLibraryControls`: 「マップ: <名前>」（`data-testid="current-map-name"`、`truncate`、最大幅 `16rem`、`title` に全文）、「マップ一覧」ボタン（`aria-haspopup="dialog"`、`aria-expanded={listExpanded}`）、「新しいマップ」ボタン（`aria-haspopup="dialog"`）。`disabled` のとき2つのボタンを `disabled` にし、「保存できないため、マップの切り替えは使えません。」を表示する。2つのボタンは `keydown` の `event.repeat` の Enter・Space を `preventDefault` する（L-408）。フォーカスリングは既存のヘッダーのボタンと同じクラス。
  - `MapLibraryNoticeRegion`: `role="status"`（`aria-live="polite"`）と `role="alert"`（`aria-live="assertive"`）の2要素を常に描画する。`sequence` が変わったら、まず両方を空にし、`requestAnimationFrame` の次の描画で、status は status 要素へ、warning・error は alert 要素へ文言を入れる（L-153、L-166）。文言が無いときは高さを持たない。
  - `AppHeader` に必須の `mapControls: ReactNode` を追加し、`h1` の直後に置く。暫定で `Home` は `null` を渡す（Task 20 で `MapEditor` の props に置き換える）。

- [ ] テストを書く。
  - `MapLibraryControls`: 名前と `title`、`aria-expanded` の切り替え、各ボタンのクリックでコールバック、`disabled` で両ボタンが無効になり理由の文言が出る。`repeat: true` の Enter の `keydown` が `defaultPrevented`、`repeat: false` は `preventDefault` されない。ボタンの名前が見える文字と一致する（L-156）。
  - `MapLibraryNoticeRegion`: 初回から2つの要素があり空。status の通知 → rAF の後に status 要素だけに文言。同じ文言で `sequence` だけを変える → 一度空になり、次の rAF で再び文言（要素は作り直さない: 同じ DOM ノードのまま）。error → alert 要素。
  - `AppHeader`: `mapControls` が `h1` の直後に描画される。
- [ ] RED: `npm test -- --runInBand MapLibraryControls.test.tsx MapLibraryNoticeRegion.test.tsx AppHeader.test.tsx`。
- [ ] 実装し、GREEN と verify。
- 知見: L-057、L-060、L-153、L-156、L-166、L-408。
- 完了条件: 部品は状態を持たず（通知領域の表示の切り替えを除く）、`Home` の挙動は変わらない。

### Task 17: ダイアログの枠・フォーカス管理・一覧の画面

**Files**
- Create: `client/src/types/mapLibraryDialog.ts`
- Create: `client/src/components/layout/useDialogFocusTrap.ts`、`__tests__/useDialogFocusTrap.test.tsx`
- Create: `client/src/components/layout/MapLibraryDialog.tsx`、`__tests__/MapLibraryDialog.test.tsx`
- Create: `client/src/components/layout/MapLibraryListScreen.tsx`、`__tests__/MapLibraryListScreen.test.tsx`

**Interfaces**
- Consumes: Task 2 の `MapIndexEntry`、Task 1 の `formatMapUpdatedAt`。
- Produces（`types/mapLibraryDialog.ts`）:
  ```ts
  export type MapLibraryDialogScreen =
    | { kind: "closed" }
    | { kind: "list" }
    | { kind: "create"; origin: "list" | "header" }
    | { kind: "rename"; mapId: string }
    | { kind: "delete"; mapId: string };
  export type OpenMapLibraryDialogScreen = Exclude<MapLibraryDialogScreen, { kind: "closed" }>;
  export type MapLibraryRowAction = "open" | "rename" | "delete";
  export type MapLibraryDialogFocusTarget =
    | { kind: "screenDefault" }
    | { kind: "listCreateButton" }
    | { kind: "row"; mapId: string; action: MapLibraryRowAction };
  export type MapLibraryDialogNotices = { status: string; alert: string }; // 空文字は表示なし
  ```
- Produces（`useDialogFocusTrap.ts`）:
  ```ts
  export function useDialogFocusTrap(options: {
    dialogRef: RefObject<HTMLElement | null>;
    overlayRef: RefObject<HTMLElement | null>;
    onEscape: () => void;
  }): void;
  ```
  - 開いている間、`document` の `focusin` を購読し、ダイアログの外へ出たフォーカスを、ダイアログの中で最後にフォーカスがあった要素（無ければ最初のフォーカス可能な要素）へ戻す。オーバーレイの `pointerdown` は `preventDefault` して同じ規則で戻す（閉じない。L-158）。
  - Tab・Shift+Tab は、無効な要素を除いてそのたびに数え直したフォーカス可能な要素の中で循環させる（L-159）。
  - Escape は window の `keydown`（capture）で受け、IME の変換中（`isComposing` または `keyCode === 229`）は何もしない。それ以外は `onEscape()`。
  - アンマウントで購読を解除する。
- Produces（`MapLibraryDialog.tsx`）:
  ```ts
  type MapLibraryDialogProps = {
    screen: OpenMapLibraryDialogScreen;
    maps: readonly MapIndexEntry[];          // 表示順
    currentMapId: string;
    notices: MapLibraryDialogNotices;
    focusTarget: MapLibraryDialogFocusTarget | null;
    onFocusTargetApplied: () => void;
    onEscape: () => void;                    // 画面ごとの戻り先はシェル側で決める
    onClose: () => void;
    onOpenCreate: () => void;
    onOpenRename: (mapId: string) => void;
    onOpenDelete: (mapId: string) => void;
    onSwitch: (mapId: string) => void;
    onCancel: () => void;
    onSubmitCreate: (nameInput: string) => void;
    onSubmitRename: (mapId: string, nameInput: string) => void;
    onConfirmDelete: (mapId: string) => void;
  };
  ```
  - 半透明の黒のオーバーレイの中央に `role="dialog"`、`aria-modal="true"`、`aria-labelledby`（その画面の見出しの id）。最大幅 `28rem`、幅 375px で収まる。
  - どの画面でも同じ位置に `role="status"` と `role="alert"` の要素を空のまま常設し、`notices` の文言だけを差し替える（L-153）。
  - `focusTarget` が変わったら `useLayoutEffect` でその要素にフォーカスし、`onFocusTargetApplied()` を呼ぶ。行のボタンは `[data-map-id="<id>"][data-map-action="<action>"]` で探す。`screenDefault` は、一覧なら開いているマップの「開く」、作成・名前変更なら入力欄、削除の確認なら「キャンセル」。`autoFocus` は使わない（L-584）。
  - Task 17 では `create`・`rename`・`delete` の画面の中身はまだ描画せず、見出しと「キャンセル」ボタンだけを置く（Task 18 で差し替える）。
- Produces（`MapLibraryListScreen.tsx`）: 見出し「マップ一覧」、「新しいマップ」ボタン（`data-map-action="create"`）、`<ul aria-label="保存済みのマップ">`、「閉じる」ボタン。各行に名前を表示する「開く」ボタン（`data-map-id`、`data-map-action="open"`、開いているマップは `aria-current="true"` と見える文字「（開いています）」）、`formatMapUpdatedAt(updatedAt)`、「名前を変更」（`aria-label="名前を変更: <名前>"`、`data-map-action="rename"`）、「削除」（`aria-label="削除: <名前>"`、`data-map-action="delete"`）。一覧は最大高さ `60vh` で縦にスクロールし、長い名前は折り返す。

- [ ] テストを書く（`userEvent` と `waitFor` でフォーカスを確かめる。L-177、L-183）。
  - `useDialogFocusTrap`: 3つのボタン（2つ目は `disabled`）で、最後から Tab → 最初、最初から Shift+Tab → 最後、`disabled` を飛ばす。表示中に1つ目を `disabled` にすると次の Tab で数え直す。外のボタンへ `focus()` すると中へ戻る。オーバーレイの `pointerdown` が `defaultPrevented` でフォーカスが中に残る。Escape で `onEscape`、`isComposing: true` の Escape では呼ばれない。アンマウント後は外へのフォーカスが戻されない。
  - `MapLibraryDialog`: `role="dialog"` と `aria-modal`、見出しによる名前。`notices` を変えても status・alert の要素が同じ DOM ノード。`focusTarget: { kind: "row", mapId: "b", action: "rename" }` で B の行の「名前を変更」にフォーカスし、`onFocusTargetApplied` が1回呼ばれる。
  - `MapLibraryListScreen`: 表示順どおりの行、同じ名前の2行が更新日時で見分けられる（L-151）、`aria-current` と「（開いています）」、各ボタンの名前が見える文字を先頭に含む（L-156）、各ボタンのコールバックに正しい id が渡る（2行以上で取り違えを検出。L-170）。
- [ ] RED: `npm test -- --runInBand useDialogFocusTrap.test.tsx MapLibraryDialog.test.tsx MapLibraryListScreen.test.tsx`。
- [ ] 実装し、GREEN と verify。
- 知見: L-151、L-153、L-155、L-156、L-158、L-159、L-170、L-177、L-183、L-584。
- 完了条件: 部品はダイアログの開閉や画面の状態を持たない（シェルから受け取る）。

### Task 18: 新規作成・名前変更・削除の確認の画面

**Files**
- Create: `client/src/components/layout/MapLibraryNameForm.tsx`、`__tests__/MapLibraryNameForm.test.tsx`
- Create: `client/src/components/layout/MapLibraryDeleteConfirm.tsx`、`__tests__/MapLibraryDeleteConfirm.test.tsx`
- Modify: `client/src/components/layout/MapLibraryDialog.tsx`、`__tests__/MapLibraryDialog.test.tsx`

**Interfaces**
- Consumes: Task 1 の `validateMapNameInput`、`DEFAULT_MAP_NAME`。Task 2 の `describeMapRemoval`、`MapRemovalPreview`。Task 17 の型と `MapLibraryDialog`。
- Produces:
  ```ts
  type MapLibraryNameFormProps = {
    mode: "create" | "rename";
    headingId: string;
    initialName: string;                    // 作成は ""、名前変更は今の名前
    inputRef: Ref<HTMLInputElement>;
    onSubmit: (nameInput: string) => void;  // 検証を通った入力だけ
    onCancel: () => void;
  };
  type MapLibraryDeleteConfirmProps = {
    headingId: string;
    descriptionId: string;
    target: MapIndexEntry;
    isCurrent: boolean;
    nextMapName: string | null;             // 開いているマップで、ほかにマップがあるとき
    isLast: boolean;
    cancelButtonRef: Ref<HTMLButtonElement>;
    onConfirm: () => void;
    onCancel: () => void;
  };
  ```
  - 名前のフォーム: 見出し「新しいマップ」／「マップ名を変更」、`<label>` 付きの入力欄「マップ名」（作成は `placeholder="無題のマップ"`、名前変更は開いたときに全選択）、作成のときだけ補足文「空欄のときは「無題のマップ」になります。」、「作成」／「変更」ボタン、「キャンセル」ボタン。`<form>` の送信だけで確定し、`blur` では確定しない（L-473）。IME の変換中の Enter（`isComposing` または `keyCode === 229`）では送信しない（L-474）。`validateMapNameInput` が失敗したら送信せず、入力欄の下に `role="alert"` でメッセージ、入力欄に `aria-invalid="true"` と `aria-describedby`。`maxLength` 属性は使わない。確定のボタンを無効にしない（L-157）。
  - 削除の確認: 見出し「マップを削除」、本文「マップ「<名前>」を削除します。削除したマップは元に戻せません。」、開いているマップなら続けて「開いているマップです。削除すると「<次の名前>」を開きます。」、最後の1つなら「最後のマップのため、削除すると空の「無題のマップ」を作成します。」（L-152）。「このマップを削除」ボタン（赤系。L-074）は `keydown` の `repeat` の Enter・Space を `preventDefault` し、`click` の `event.detail > 1` を無視する（L-408）。「キャンセル」ボタン。ダイアログに `aria-describedby` で本文を参照させる。
  - `MapLibraryDialog` は `create`・`rename`・`delete` の画面でこれらを描画し、`screenDefault` のフォーカス先を入力欄・「キャンセル」にする。
  - 削除の確認の `target`・`isCurrent`・`isLast`・`nextMapName` は、`MapLibraryDialog` が props の `maps`・`currentMapId` と画面の `mapId` から Task 2 の `describeMapRemoval(maps, currentMapId, mapId)` で計算する（`nextMapName = preview.nextMap?.name ?? null`）。ほかの場所で次のマップを選ばない。`describeMapRemoval` が `null`（対象がもう無い）のときは削除の確認を描画せず、`onCancel()` と同じく一覧へ戻す。

- [ ] テストを書く。
  - 名前のフォーム: 空欄で送信 → `onSubmit("")`（正規化は呼び出し側）。51文字（絵文字）で送信 → `onSubmit` が呼ばれず、エラー文「（現在 51 文字）」と `aria-invalid`。50文字は送信できる（L-182）。`isComposing: true` の Enter で送信しない。入力欄からの `blur` で `onSubmit` が呼ばれない。名前変更で初期値が全選択される。「キャンセル」で `onCancel`。
  - 削除の確認: 3通り（開いていない・開いている・最後）の文言。`repeat: true` の Enter の `keydown` が `defaultPrevented`。`detail: 2` の click で `onConfirm` が呼ばれず、`detail: 1` で呼ばれる。
  - `MapLibraryDialog`: 削除の確認の画面で、開いたときのフォーカスが「キャンセル」、ダイアログの `aria-describedby` が本文を指す。作成の画面で入力欄にフォーカス。
  - `MapLibraryDialog` の削除の確認の文言: 3件 A（更新 10:00、開いている）・B（12:00）・C（11:00）で A の削除 → 「削除すると「B」を開きます。」（配列の先頭や C ではない。L-170）、B の削除 → 次のマップの文言が無い、1件だけ → 最後のマップの文言。
- [ ] RED: `npm test -- --runInBand MapLibraryNameForm.test.tsx MapLibraryDeleteConfirm.test.tsx MapLibraryDialog.test.tsx`。
- [ ] 実装し、GREEN と verify。
- 知見: L-057、L-074、L-152、L-157、L-182、L-408、L-473、L-474。
- 完了条件: 4つの画面がすべて描画でき、確定は送信の1か所だけ。

### Task 19: ダイアログの状態と操作の振り分け

**Files**
- Create: `client/src/hooks/useMapLibraryDialogState.ts`
- Create: `client/src/hooks/__tests__/useMapLibraryDialogState.test.tsx`

**Interfaces**
- Consumes: Task 8・9 の `UseMapLibraryResult`・`MapLibraryOperationResult`、Task 16 の `ShellNotice`、Task 17 の型。
- Produces:
  ```ts
  export type HeaderFocusRequest = "list" | "create";
  export type UseMapLibraryDialogStateResult = {
    screen: MapLibraryDialogScreen;
    notices: MapLibraryDialogNotices;
    focusTarget: MapLibraryDialogFocusTarget | null;
    headerFocusRequest: HeaderFocusRequest | null;
    shellNotice: ShellNotice | null;
    openList: () => void;
    openCreateFromHeader: () => void;
    openCreateFromList: () => void;
    openRename: (mapId: string) => void;
    openDelete: (mapId: string) => void;
    back: () => void;                       // Escape と「キャンセル」の共通処理
    close: () => void;                      // 一覧の「閉じる」
    submitCreate: (nameInput: string) => void;
    switchTo: (mapId: string) => void;
    submitRename: (mapId: string, nameInput: string) => void;
    confirmDelete: (mapId: string) => void;
    consumeFocusTarget: () => void;
    consumeHeaderFocusRequest: () => void;
  };
  export function useMapLibraryDialogState(options: {
    library: Pick<UseMapLibraryResult, "createMap" | "switchMap" | "renameMap" | "deleteMap">;
    maps: readonly MapIndexEntry[];          // 表示順
    startupNotice: OperationNotice | null;
  }): UseMapLibraryDialogStateResult;
  export function selectFocusAfterRemoval(maps: readonly MapIndexEntry[], removedId: string): MapLibraryDialogFocusTarget;
  ```
- 遷移と通知（設計書の「キーボード操作とフォーカス」「通知の文言」の表どおり）:
  - `openList` → `list`、`focusTarget: screenDefault`。`openCreateFromHeader` → `create(header)`。`openCreateFromList` → `create(list)`。`openRename`・`openDelete` → 対応する画面。いずれも `notices` を空にし `screenDefault`。
  - `back`: `create(header)` → 閉じて `headerFocusRequest: "create"`。`create(list)` → 一覧、`listCreateButton`。`rename(id)` → 一覧、`row(id, "rename")`。`delete(id)` → 一覧、`row(id, "delete")`。`list` → 閉じて `headerFocusRequest: "list"`。
  - `close` → 閉じて `"list"`。閉じるときは `notices` を空にする。
  - 成功で `remounted: true`（作成・切り替え・開いているマップと最後の削除）→ 閉じる、`shellNotice` を `{ sequence: 前+1, notice }`、`headerFocusRequest: "list"`。
  - `switchTo` で現在のマップ（`remounted: false`、`notice: null`）→ 閉じて `"list"`、`shellNotice` は変えない。
  - 名前変更の成功 → 一覧、`notices.status` に名前変更の通知（`notice: null` のときは空のまま）、`row(id, "rename")`。
  - 開いていないマップの削除の成功 → 一覧、`notice` の種類に応じて status か alert、`saveRetryNotice` は alert、`selectFocusAfterRemoval(削除前の maps, id)`（次の行の「開く」、無ければ前の行、どちらも無ければ `listCreateButton`）。
  - 失敗（`ok: false`）→ 画面とフォーカスを変えず、`notices.alert` に文言、`status` を空にする。
  - `startupNotice` は、`Home` が最初に loading を描画するため、最初の描画では常に `null` で、起動の確定後の描画で値に変わる。`startupNotice` が `null` から値に変わったときに1回だけ `shellNotice` にする（`sequence` は前の値+1）。最初から値がある場合も同じく1回だけ。1回使ったことは state に持ち、レンダー中の条件付きの state 調整で反映する（effect で遅らせない。ref をレンダー中に書かない。L-521）。同じ値・別の値に変わっても2回目は出さない（起動の結果は1回だけ確定するため）。
  - 同じイベントの中で続けて状態を変えるときは関数形式の更新を使う（L-453）。

- [ ] テストを書く（`library` は結果を差し替えられる偽物。L-171: 本物と同じ結果型を返す）。
  - `back` の5通りと `close` の行き先。
  - 作成・切り替え・開いているマップの削除・最後の削除の成功で `screen.kind === "closed"`、`shellNotice.sequence` が1ずつ増え、`headerFocusRequest === "list"`。ダイアログの `notices` は空（L-249: 同じ結果を重ねない）。
  - 失敗で `screen` と `focusTarget` が変わらず、alert に文言。続けて成功すると alert が空になる。
  - 名前変更の成功で status に「マップの名前を「…」に変更しました。」、フォーカスはその行の「名前を変更」。
  - 開いていないマップの削除: 3件 [A, B, C] で B → `row(C, "open")`、C → `row(B, "open")`。`saveRetryNotice` があると status と alert の両方に文言。本体の削除失敗の warning は alert だけ。
  - `selectFocusAfterRemoval`: 1件だけ → `listCreateButton`。
  - `startupNotice`: `null` で描画 → `shellNotice` が `null`。rerender で warning に変える → `shellNotice` が `{ sequence: 1, notice: warning }`。さらに別の warning のオブジェクトで rerender しても `shellNotice` は変わらない。最初から warning で描画した場合も `sequence: 1` が1回だけ。warning の後に作成に成功すると `sequence: 2` の作成の通知になる。
- [ ] RED: `npm test -- --runInBand useMapLibraryDialogState.test.tsx`。
- [ ] 実装し、GREEN と verify。
- 知見: L-155、L-166、L-171、L-249、L-453。
- 完了条件: シェルが画面遷移・通知の振り分け・フォーカスの戻し先の判断を持たずに済む。

### Task 20: シェルとエディタの分離

**Files**
- Create: `client/src/components/map/MapEditor.tsx`
- Create: `client/src/components/map/__tests__/MapEditor.test.tsx`
- Modify: `client/src/app/page.tsx`

**Interfaces**
- Consumes: Task 6 の暫定の `createLegacyMapStorageSession`、Task 12 の `shortcutsEnabled`、Task 13・14 の `mapName`、Task 16 の `mapControls`。
- Produces:
  ```ts
  type MapEditorProps = {
    mapId: string;
    mapName: string;
    storageSession: MapStorageSession;
    mapControls: ReactNode;
    shortcutsEnabled: boolean;
  };
  export function MapEditor(props: MapEditorProps);
  ```
  - 今の `Home` の中身（`useNodes` から `AppWorkspace` まで）をそのまま移す。`useMapPersistence` に `storageSession` と `mapName`、`useMapImageExport` に `mapName`、`AppHeader` に `mapControls`、`MapStage` に `shortcutsEnabled`、`useMapHistoryShortcuts` に `enabled: shortcutsEnabled` を渡す（Task 10・12・13・14・16 の暫定の値を props に置き換える）。
  - 根の要素は `flex min-h-0 flex-1 flex-col` にし、`inert={!shortcutsEnabled}` を付ける（ダイアログ表示中と同値）。`mapId` はこのタスクでは `data-map-id` 属性に出すだけで、照合には使わない。
  - `Home` は暫定で、`<div className="flex h-dvh flex-col bg-zinc-50 dark:bg-zinc-900">` の中に `<MapEditor key="legacy" mapId="legacy" mapName={DEFAULT_MAP_NAME} storageSession={legacySession} mapControls={null} shortcutsEnabled />` を描画する。挙動は変えない。

- [ ] `MapEditor.test.tsx` を書く（ページのテストと同じ Pixi・ダウンロードのモック）。
  - `mapControls` に渡した要素がヘッダーの `h1` の直後に出る。
  - `shortcutsEnabled={false}` で根に `inert` が付き、body から Ctrl+Z を送ってもノードが戻らない。`true` で `inert` が無い。
  - `mapName="旅行"` で JSON 書き出しのダウンロードに `"旅行"` が渡り、SVG のファイル名が `旅行-` で始まる（L-060）。
  - `storageSession` に偽のセッションを渡すと、その `readBody` の内容が表示され、編集後300msで `writes` に書かれる。
- [ ] RED: `npm test -- --runInBand MapEditor.test.tsx`。
- [ ] 移動を実装する。既存のページのテスト6ファイルが変更なしで通ることを `npm test -- --runInBand page` で確かめ、verify。
- 知見: L-060。
- 完了条件: `Home` は `MapEditor` を1つ描画するだけになり、既存のページのテストを変えずに通る。

### Task 21: ページの結合（シェル）

**Files**
- Modify: `client/src/app/page.tsx`
- Create: `client/src/app/__tests__/pageMapLibrary.test.tsx`
- Modify: `client/src/services/persistence/mapStorage.ts`、`__tests__/mapStorage.test.ts`（暫定の `createLegacyMapStorageSession` と `writeStoredMapJson` を削除。旧キーの読み取りと削除だけを残す。（ローカルレビュー第12周の指摘1で、移行のやり直しが失敗したときの書き戻し `restoreStoredMapJson` を足した））
- Modify（保存結果を読む箇所と、`getByRole("alert"|"status")` の8か所だけ）: `client/src/app/__tests__/page.test.tsx`、`pageHistory.test.tsx`、`pageDuplication.test.tsx`、`pageClipboard.test.tsx`、`pageCollapse.test.tsx`

**Interfaces**
- Consumes: Task 4 の `getBrowserMapLibraryStorage`、`readActiveMapJson`、`activeMapBodyKey`。Task 5 の `generateMapId`。Task 8・9 の `useMapLibrary`。Task 16 の `MapLibraryControls`、`MapLibraryNoticeRegion`。Task 17・18 の `MapLibraryDialog`。Task 19 の `useMapLibraryDialogState`。Task 20 の `MapEditor`。
- Produces（`Home`）:
  - モジュールの定数 `MAP_LIBRARY_DEPS = { getStorage: getBrowserMapLibraryStorage, now: () => new Date(), generateId: () => generateMapId() }` を `useMapLibrary` に渡す。
  - 根: `<div className="flex h-dvh flex-col bg-zinc-50 dark:bg-zinc-900">` の先頭に `MapLibraryNoticeRegion`（常に描画。`inert` にしない）。`view.status === "loading"` の間は `<p role="status">マップを読み込んでいます…</p>` を表示し、エディタを描画しない。
  - `ready` のとき `<MapEditor key={currentMap.id} mapId={currentMap.id} mapName={currentMap.name} storageSession={view.storageSession} shortcutsEnabled={dialog.screen.kind === "closed"} mapControls={<MapLibraryControls ... />} />`。
  - `MapLibraryControls` の `disabled` は `storageMode === "protected"`、`listExpanded` は `screen.kind === "list"`。ref は `Home` が持つ `listButtonRef`・`createButtonRef`。
  - `screen.kind !== "closed"` のとき `MapEditor` の外に `MapLibraryDialog` を描画する。`onEscape` と `onCancel` は `dialog.back`。
  - `headerFocusRequest` は `useLayoutEffect`（依存: 要求と `currentMap.id`）で対応する ref にフォーカスして `consumeHeaderFocusRequest()`。再マウントで新しいヘッダーの ref がつながった後に動く。
  - `startupNotice` は `useMapLibraryDialogState` に `view.status === "ready" ? view.startupNotice : null` として渡し、Task 19 の「`null` から値に変わったときに1回だけ」の規則で `shellNotice` として出す。`useMapLibraryDialogState` は loading の間も呼ぶ（フックを条件付きで呼ばない）。loading の間の `maps` は空配列。
- 既存のページのテストの変更（「既存のページのテストの移行方針」の段階2）:
  - `page.test.tsx` の `getItem("draw-my-map.map.v1")`、`pageHistory`・`pageDuplication`・`pageClipboard` の `storedMap()` の中の `getItem(STORAGE_KEY)`、`pageCollapse` の `getItem(STORAGE_KEY)` → `readActiveMapJson(window.localStorage)`。
  - `pageHistory`・`pageDuplication`・`pageClipboard` の `filter(([key]) => key === STORAGE_KEY)` → `filter(([key]) => key === activeMapBodyKey(window.localStorage))`。
  - 初期データの `setItem(STORAGE_KEY, ...)` は変えない（移行の経路で読まれる）。
  - `MapLibraryNoticeRegion` は空の `role="status"` と `role="alert"` を常に描画するため、`screen.getByRole("alert")`・`screen.getByRole("status")` が複数の要素に一致して失敗する。次の8か所を範囲を絞る形に直す。
    - ヘッダーの通知欄の通知（7か所）: `pageClipboard.test.tsx:431`・`:441`、`pageDuplication.test.tsx:418`・`:445`、`pageCollapse.test.tsx:284`、`page.test.tsx:298`、`pageHistory.test.tsx:604` → `within(screen.getByRole("banner")).getByRole("alert")`（`pageCollapse:284` は `"status"`）。`within` を import に足す。
    - 右パネルの生成中の表示（1か所）: `pageHistory.test.tsx:504` の `screen.getByRole("status")` → `screen.getByText(/生成中です/).closest('[role="status"]')` が `null` でないことを確かめる形にする（ヘッダーの外なので `banner` では絞れない）。
    - 行番号は Task 20 の時点の値。ずれている場合は `grep -n 'ByRole("alert"\|ByRole("status"' client/src/app/__tests__/*.tsx` で探し、新しく追加する `pageMapLibrary*.test.tsx` 以外の一致をすべて直す。

- [ ] `pageMapLibrary.test.tsx` を書く（実際の `Home`。Pixi・イラスト生成・ダウンロード・画像化だけをモック。`seedMapLibrary` で初期データを置く。フォーカスは `userEvent` と `waitFor`。L-177、L-183）。
  - 初回起動: 空の localStorage で描画すると、ヘッダーに「マップ: 無題のマップ」、インデックスができる。
  - 新規作成: 「新しいマップ」→ 名前「旅行」→「作成」で、空のマップに切り替わり、ヘッダーが「マップ: 旅行」、シェルの status に「マップ「旅行」を作成しました。」、フォーカスがヘッダーの「マップ一覧」。空欄で作成すると「無題のマップ」。51文字ではエラーが出て作成されない。同じ名前を2つ作れる。
  - 切り替え: 2件を seed（A にノード「A1」、B にノード「B1」）。一覧から B を開くと B1 が表示され、A1 が無い。インデックスの `currentMapId` が B。
  - 名前変更: 一覧で A の名前を「新A」に変えると、一覧とヘッダーに反映、ダイアログの status に通知、フォーカスが A の行の「名前を変更」。アンマウントして再描画しても「新A」。本体と `updatedAt` は変わらない。
  - 削除の3通り: 開いていないマップ（一覧から消える、開いているマップはそのまま）、開いているマップ（最後に更新した別のマップが開く）、最後の1つ（新しい「無題のマップ」が開く）。確認のダイアログの「キャンセル」で何も変わらない。
  - 再読み込み: B に切り替えてからアンマウント → 再描画で B が開く。
  - 保護モード: `jest.spyOn(Storage.prototype, "getItem")` で例外を投げると、warning の起動時の通知、「マップ一覧」「新しいマップ」が無効で理由の文言。
  - 起動時の通知: 壊れたインデックス（`"{"`）と本体1件で、シェルの alert に作り直しの warning、退避キーに `"{"`、ヘッダーが「マップ: 復元したマップ 1」。
- [ ] RED: `npm test -- --runInBand pageMapLibrary.test.tsx`。
- [ ] 配線を実装し、暫定のレガシーセッションと `writeStoredMapJson` を削除する。既存のページのテストを上の方針で書き換え、`npm test -- --runInBand page` が通ることを確かめ、verify。
- 知見: L-060、L-155、L-177、L-183、L-469。
- 完了条件: 実際の `Home` から `useMapLibrary`・`MapEditor`・ヘッダー・ダイアログ・通知領域までがつながり、`mapStorage.ts` には旧キーの読み取りと削除だけが残る（ローカルレビュー第12周の指摘1で、移行のやり直しが失敗したときの書き戻し `restoreStoredMapJson` を足した）。既存のページのテストが通る。

### Task 22: 混在の防止・失敗時・キーボードの結合テスト

**Files**
- Create: `client/src/app/__tests__/pageMapLibrarySwitch.test.tsx`
- Create: `client/src/app/__tests__/pageMapLibraryDialog.test.tsx`
- Modify（テストで見つかった不具合がある場合だけ）: `client/src/app/page.tsx`、`client/src/hooks/useMapLibrary.ts`、`client/src/hooks/useMapLibraryDialogState.ts`

**Interfaces**
- Consumes: Task 21 までの `Home` と、Task 4 の補助関数。新しい公開 API は作らない。

- [ ] `pageMapLibrarySwitch.test.tsx`（fake timers）:
  - 300ms 以内の切り替え: A でノードを追加し 100ms 後に B へ切り替えると、A の本体に追加したノードがある（flush）。B へ切り替えた後の 300ms で A の本体が再び書かれない（書き込みの履歴をキーで絞って確かめる。L-419）。
  - 履歴の混在: A でノードを追加 → B へ切り替え → 「元に戻す」が無効、Ctrl+Z で B が変わらない。B を編集して A に戻すと、A と B の本体はそれぞれの編集だけを含む。
  - 表示状態の初期化: A で検索クエリを入れ、枝を折りたたみ、表示を「すべて」にしてから B へ切り替えると、検索欄が空、折りたたみが無い、表示が「自動」。
  - ビューポートの初期化: A でホイールのズーム（`mockStageHandlers` 経由。既存の `MapStage` のテストと同じ方法）とパンをして、`lastWorldContainer()` の `scale`・`position` が初期値から変わったことを確かめてから B へ切り替えると、新しい `lastWorldContainer()` の `scale`・`position` が `INITIAL_VIEWPORT` の値に戻っている。
  - 生成中のイラスト: `generateIllustrationThumbnail` のモックを保留する Promise にして、A のノード（id 1）でイラスト生成を始めてから B（同じ id 1 のノードを持つ）へ切り替え、Promise を解決する。B の右パネルにプレビューも「ノードに設定」も出ず、B の JSON 書き出しのノードに `illustration` が無く、B の本体も変わらない（アンマウント時の `abort` と、id だけで結び付けないことの確認。L-037）。
  - A → B → A（L-571）: A の編集の保存待ち（100ms）を残したまま B へ、すぐ A へ戻り、さらに 300ms 進めても、A の本体は flush で書いた内容と、2回目の A での編集だけ（古いエディタのタイマーの書き込みが無い）。
  - flush の失敗: `jest.spyOn(Storage.prototype, "setItem")` で A の本体キーへの書き込みだけ例外を投げると、編集後の一覧からの切り替えが中止され、ダイアログの alert に「現在のマップを保存できなかったため、マップを切り替えませんでした。…」、ダイアログとフォーカスがそのまま、ヘッダーのマップ名は A。新規作成も同じく中止される。続けて別のマップ C を削除すると（このテストでは削除後は書き込みを成功させる）、A の本体に保存され、エディタの保存失敗の通知が消える。
  - 非同期の破棄（L-037、L-103）: PNG 書き出しのラスタライズを保留したまま B へ切り替えて解決しても、ダウンロードも通知も無い。JSON 読み込みの `file.text()` を保留したまま切り替えて解決しても、B の内容が変わらず、B の本体も変わらない。
  - 名前変更の後の書き出し: 名前を「旅行/計画」に変えると、JSON・SVG・PNG のファイル名が `旅行_計画-` で始まる（L-060）。
  - 移行と StrictMode: 旧キーだけを置いて `<StrictMode><Home /></StrictMode>` を描画すると、内容が表示され、旧キーは残り、壊れた旧キーの場合は warning の起動時の通知が消えずに残る（L-469）。
- [ ] `pageMapLibraryDialog.test.tsx`（`userEvent`、`waitFor`）:
  - 各画面の最初のフォーカス（一覧は開いているマップの「開く」、作成・名前変更は入力欄、削除の確認は「キャンセル」）。
  - Escape の戻り先: 一覧 → ヘッダーの「マップ一覧」、ヘッダーから開いた作成 → ヘッダーの「新しいマップ」、一覧から開いた作成・名前変更・削除 → 一覧の元のボタン。
  - Tab の循環と、ダイアログの外（`document.body`）へのフォーカスが中に戻る。
  - ダイアログ表示中のショートカット停止（L-173）: ノードを選択した状態でダイアログを開き、`document.body` にフォーカスを置いて Ctrl/Cmd+Z・Delete・`F`・`copy` イベントを送っても、ノードとビューポートが変わらない。エディタの根に `inert` が付いている。閉じると元どおり動く。
  - 開いていないマップの削除の後のフォーカスが次の行の「開く」。
  - 削除の確認と実際に開くマップの一致（L-170）: `seedMapLibrary` で配列の順と表示順が異なる3件（A: 更新 10:00・開いている、B: 12:00、C: 11:00。配列の順は C, A, B）を置き、A の「削除」を開くと確認の文言が「削除すると「B」を開きます。」で、「このマップを削除」の後にヘッダーが「マップ: B」になり、シェルの通知が「マップ「A」を削除し、「B」を開きました。」。
  - 「削除」の行のボタンの押し続け（`repeat: true` の Enter）で確認が飛ばされない（L-408）。
- [ ] RED の確認: 新しいテストは Task 21 の実装で通る場合がある。その場合は、主要な配線を1つずつ一時的に壊して、対応するテストが失敗することを確かめてから元に戻す。壊す箇所: `Home` の `shortcutsEnabled` を常に `true`、`useMapLibrary` の切り替えの flush を外す、`writeBody` のセッション番号の照合を外す、`useMapPngExport` のアンマウントの印を外す、`MapEditor` の `key` を固定値にする。
- [ ] 失敗したテストがあれば最小の修正を入れ、`npm test -- --runInBand pageMapLibrarySwitch.test.tsx pageMapLibraryDialog.test.tsx` を GREEN にし、verify。
- 知見: L-037、L-060、L-103、L-173、L-408、L-419、L-469、L-571。
- 完了条件: 設計書の受け入れ基準 3（ビューポートの初期化を含む）・4・7・8（生成中のイラストが新しいマップに付かないことを含む）・9・11 が結合テストで固定され、変異の確認の結果を報告に書く。

### Task 23: 既存のページのテストの移行

**Files**
- Modify: `client/src/app/__tests__/page.test.tsx`、`pageHistory.test.tsx`、`pageDuplication.test.tsx`、`pageClipboard.test.tsx`、`pageCollapse.test.tsx`、`pageSearch.test.tsx`

**Interfaces**
- Consumes: Task 4 の `seedMapLibrary`、`readActiveMapJson`、`activeMapBodyKey`、`MAP_INDEX_STORAGE_KEY`、`mapBodyKey`。

- [ ] 初期データの `window.localStorage.setItem(STORAGE_KEY, json)` をすべて `seedMapLibrary(window.localStorage, [{ json }])` に置き換え、各ファイルの `const STORAGE_KEY = "draw-my-map.map.v1"` を消す（「既存のページのテストの移行方針」の段階3）。
- [ ] `setItem` の回数を見るテストは、`activeMapBodyKey` で絞った後に、回数と、書かれた値の履歴（ノード数の列など）を確かめる。インデックスへの書き込みが別にあることを前提にする（L-419）。
- [ ] `page.test.tsx` に旧キーからの移行の専用のテストを足す。
  - 旧キーだけ（V3）を置いて描画すると、内容が表示され、インデックス（`P: true`）と本体ができ、旧キーが残る。
  - アンマウントして2回目の描画で旧キーが消え、インデックスが `P: false`。
  - 旧キーが壊れていると、旧キーが残り、空の「無題のマップ」で warning の起動時の通知が出る。
- [ ] RED の確認: 移行のテストは既に実装があるため、`runMapLibraryStartup` の後始末の分岐を一時的に外すと2回目の描画のテストが失敗することを確かめて戻す。
- [ ] `grep -rln "draw-my-map.map.v1" client/src/app/__tests__` の結果が、旧キーからの移行を確かめる `page.test.tsx` と `pageMapLibrarySwitch.test.tsx`（Task 22 の「移行と StrictMode」のテスト）の2ファイルだけで、それぞれの中でも移行のテストだけが旧キーを使っていることを確かめ、`npm test -- --runInBand page` と verify。
- 知見: L-171、L-419、L-469。
- 完了条件: ページのテストが通常の保存経路（インデックスと本体）で初期データを置いている。旧キーは `page.test.tsx` と `pageMapLibrarySwitch.test.tsx` の移行のテストだけが使う。

### Task 24: 文書の更新

**Files**
- Modify: `docs/specifications/features.md`、`docs/specifications/data-model.md`、`docs/architecture/overview.md`
- Modify: `README.md`、`client/README.md`、`docs/README.md`
- Modify: `docs/testing/browser-test-cases.md`

- [ ] `features.md`: 1.2（画面レイアウトにマップ名・「マップ一覧」「新しいマップ」とシェルの通知の行）、6.1（マップごとの自動保存、flush、容量の共有と保存失敗の新しい文言）、6.2（JSON は現在のマップだけを置き換え、名前は変えない。ファイル名の規則）、6.3（画像のファイル名の規則）、8.2（切り替えで履歴が破棄される）、11.4（ヘッダーのマップ操作とダイアログの ARIA）を更新し、新しい「12. 複数マップ」の節を足す（作成・一覧・切り替え・名前変更・削除の3通り・名前の規則・ダイアログのキーボード操作とフォーカス・保護モード・起動時の通知・他タブとの同時編集は対象外で最後に書いた側が残ること）。既存の「11. 完全操作リファレンス」の番号と目次を合わせる。
- [ ] `data-model.md` の5章: キーの表（インデックス・本体・退避・旧キー）、`MapIndexV1` と `MapStorageSession` の型、インデックスの読み込みと正規化、起動の分岐と通知の表、移行と旧キーの後始末、書き込み順序と途中失敗の扱い、自動保存と flush、操作通知の一覧（新しい文言）。2.3 に `MapIndexV1` の型の参照を足す。
- [ ] `overview.md`: 構成図のキーを新しいキーに、シェル（`Home`）・`MapEditor`・`useMapLibrary`・`mapLibraryStorage`・`domain/mapLibrary/` の責務、セッション番号による照合を追記する。
- [ ] `README.md`・`client/README.md`・`docs/README.md`: 複数マップの機能（Phase 12）の要約、`localStorage` の保存構造、ディレクトリ構成の `domain/mapLibrary/` を追記し、容量超過の案内を新しい文言に合わせる。
- [ ] `browser-test-cases.md`: 冒頭の対象に Phase 12 を足す。「Phase 12: 複数マップの保存・切り替え」の節を追加し、設計書の「手動テスト」の表の O-01〜O-12 を、前提・手順・期待の形で書く。共通の決まりとして、`npm run build` の後に `npm run start -- -p 3112` の本番ビルド（別のオリジン）で行い、消すキーは名前を指定して消し、「すべて消去」を使わない（L-072）。結果は実ブラウザで確かめたものだけを記録する（L-176）。事前準備の 5 と N-01 の前提の `draw-my-map.map.v1` の削除を、`draw-my-map.maps.v1` で始まるキー（と、残っていれば `draw-my-map.map.v1`）を名前を指定して削除する手順に直す。
- [ ] 文書に書いた型名・関数名・文言が実装と一致することを `grep` で確かめる（`AUTO_SAVE_FAILURE_MESSAGE` の文言、キー名、`useMapLibrary` など）。`git diff --check` と verify。
- 知見: L-072、L-176。
- 完了条件: 設計書の受け入れ基準 13 に挙がった文書が実装と一致する。実ブラウザで確認していない項目を確認済みと書いていない。

### Task 25: ROADMAP の更新と最終検証

**Files**
- Modify: `ROADMAP.md`

- [ ] Phase 12 の見出しを「（完了）」にし、5項目（名前を付けてマップを新規作成する／保存済みマップの一覧を表示し、編集対象を切り替える／マップの名前変更・削除に対応する／マップごとに自動保存し、既存の単一マップの保存データを移行する／マップ切り替え時に編集履歴や非同期処理が別マップへ混在しないようにする）を `[x]` にする。Phase 13 は未着手のまま変えない。
- [ ] 「現在地」に Phase 12 の完了の要約を1項目足し（インデックスと本体の分割、旧キーからの移行、ダイアログでの作成・切り替え・名前変更・削除、セッション番号による混在の防止、実ブラウザで確認した範囲と未確認の範囲）、「次に取り組む項目は、Phase 12「名前を付けてマップを新規作成する」。Phase 12〜13は未着手。」の行を「次に取り組む項目は、Phase 13「インデント付きの箇条書きテキストを親子構造として解析する」。Phase 13は未着手。」に直す（「Phase 12〜13は未着手。」を「Phase 13は未着手。」に変える）。文書体系の行の「Phase 0からPhase 11」を「Phase 0からPhase 12」に変える。
- [ ] 「最終更新」を実装を完了した日付にする。
- [ ] `cd client && npm run verify` と `git diff --check` を実行し、テストのスイート数・テスト数と、lint・typecheck・build の成功を報告に書く。
- [ ] 全体の仕様・品質レビューを別のサブエージェントで行い、指摘を解消する。
- [ ] ブランチと worktree を保持する。コミット・push・PR は明示の依頼が無ければ行わない。完了報告では、ブランチ名・worktree のパス・未決事項（実ブラウザの未確認のケースなど）を伝える。
- 完了条件: ROADMAP の Phase 12 だけが完了になり、現在地・次の項目・最終更新が実態と一致する。verify が成功している。

---

## 設計書との対応

| 設計書の節 | タスク |
| :--- | :--- |
| 保存構造（キー・型・id・日時・正規化） | 1, 2, 4, 5 |
| 起動と移行（判定の1回だけの確定、分岐、移行、後始末、破損、保護モード） | 3, 5, 8, 21, 22, 23 |
| 複数キーの書き込み順序と整合性 | 4, 5, 8, 9 |
| 自動保存（セッション、flush、切り替え・新規作成・削除のときの順序） | 6, 7, 8, 9 |
| 切り替え（再マウント、revision との関係、非同期処理） | 15, 20, 21, 22 |
| UI（ヘッダー、ダイアログ、入力の規則、キーボード操作とフォーカス、見た目） | 10, 11, 12, 16, 17, 18, 19, 21, 22 |
| JSON と画像の書き出し | 1, 13, 14, 22 |
| 通知の文言 | 3, 6, 8, 9, 16, 19 |
| 既存のコードとテストへの影響 | 6, 13, 14, 21, 23 |
| 手動テスト・文書 | 24 |
| ROADMAP | 25 |
