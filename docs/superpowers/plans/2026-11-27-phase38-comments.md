# Phase 38（096/097）: ノードコメントと解決管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development。1 Task ＝ 1 サブエージェントで、前の Task のレビューが終わってから次へ進む。作業場所: メインのチェックアウトのブランチ `feat/phase38-comments`（worktree 不使用）。**コミットしない**（コミットは開発ループの `commit-ja` で行う）。

**Goal:** Phase 37 の共有基盤の上に、comment 権限の共有リンク、ノードごとのコメントスレッド（096）、スレッドの解決・再開（097）を 1 PR で届ける。098（変更通知・メンション）は対象外。

**Architecture:** コメントの正本は Cloudflare D1 の `share_comment_threads` / `share_comments`。Next.js Route Handlers（Node）から D1 REST で読み書きする。到達経路は「所有者セッション＋`sharedMapId`」（編集シェル）と「comment リンクのトークン」（閲覧シェル `/share/[token]`）の 2 つで、どちらも `ShareCommentService` の `resolveAccess` を通る。ローカルの MapDocument・localStorage には何も書かない。

**Tech Stack:** Next.js App Router（16.4.6）、Auth.js（next-auth v5 beta）、React、TypeScript、Jest、Pixi.js、Cloudflare D1 REST

**設計:** `docs/superpowers/specs/2026-11-27-phase38-comments-design.md`（以下「設計」）  
**棚卸し:** `docs/superpowers/specs/2026-11-27-phase38-comments-inventory.md`（以下「棚卸し」）

## Global Constraints

- 設計と棚卸しが正本。食い違いに気づいたら実装を止めて報告する（推測で埋めない）。
- **TDD**: 各 Step で先にテストを足し、`npx jest <対象>` で **RED を確認してから** 実装する。
- **各 Task の終わりに** `client` ディレクトリで `npx tsc --noEmit` と、その Task の対象テストが通ること。型やシグネチャを変える Task は、呼び出し元とテストの置換を同じ Task の中で済ませる（後の Task へ持ち越さない）。
- 成否は `ShareResult<T>`（`client/src/domain/share/shareResult.ts`）で返す。void 成功は使わない（L-001）。呼び出し側は `ok` のときだけ成功の後続処理をする。
- 権限が無い・存在しない・他人のリソース・view リンク・失効トークンは **404**（`not-found`）。403 は使わない。未ログインは 401（`unauthenticated`）。判定順は設計 §6.2 / §6.3。
- Google `sub`（`author_user_id` 等）とメールアドレスは **どの API 応答にも含めない**。表示名はサーバーがセッションから設定し、クライアントの表示名キーは拒否する（L-1032）。
- コメント本文・表示名・ラベルは **プレーンテキスト** として React の子要素で描く。`dangerouslySetInnerHTML`・`NodeNoteMarkdown`・自動リンクは使わない。
- 平文トークンをログ・エラー文言・レートキーに出さない（既存どおり `tokenHash` をキーにする）。D1 の生エラーを UI に出さない。
- 必須 props / 必須 deps を省略可能にしない（L-060）。不要なときは `null` や空 Map を明示的に渡す。
- 閲覧シェル（`client/src/app/share/[token]/`・`client/src/components/share/`）から `MapEditor`・`MapCommentsDialog`・`CommentsControl`・`NodeCommentsSection`・`useMapEditorComments` を import しない（L-061）。
- UI 文言は日本語の固定文言（定数）。コードの識別子は英語。
- ポーリング・リアルタイム更新は作らない。ノードへの移動（選択・中央表示）とスレッド丸ごとの削除は作らない（設計の非目標）。
- 新しい環境変数は無い。

## 気をつける知見 ID

`$DEV_FLOW_KIT/lessons/review-lessons.md`（ローカル: `/Users/mash/Desktop/dev-flow-kit/lessons/review-lessons.md`）の本文を、該当 Task の前に読む。

| ID | 主な Task | 要点 |
|---|---|---|
| L-001 | 全 Task | Result を返し、成功時だけ後続処理 |
| L-002 | 8a, 7b | 一覧の idle / loading / ready / error を分け、error で 0 件案内やバッジを出さない |
| L-003 | 3b | 検証と上限判定の後に書く。スレッド作成の 2 文目失敗は補償 |
| L-037 / L-040 / L-883 / L-571 / L-1037 | 7b, 8a | 世代番号と要求番号で古い応答を捨てる。ログアウトで一覧を捨てる |
| L-044 / L-470 | 2 | D1 の `meta.changes` の形を検証する |
| L-046 | 3c | `nodeId` は数値型の安全な正整数のみ |
| L-059 | 2, 9 | D1 モックの期待値を公式ドキュメントと既存パースに合わせ、実環境は手動テストで確認 |
| L-060 | 5, 6, 7b, 8b | 必須 props / deps の配線を結合テストで固定 |
| L-061 | 7b, 8b | view リンクと所有者専用 UI を閲覧シェルに未マウント |
| L-166 / L-931 | 7b, 8a | 通知のクリア契機。送信前検証で止めた経路は前の通知を消さない |
| L-397 | 7a | 削除・解決・再開の後のフォーカス移動先 |
| L-408 | 7a | 削除の確認ボタンに `preventRepeatedActivationClick` |
| L-463 | 7b, 8a | セッション loading 中は投稿系・ログイン導線を出さない |
| L-474 | 7a | IME 変換中の Ctrl/Cmd+Enter を無視 |
| L-575 | 3b | 主処理確定後の後始末の失敗を失敗として返さない |
| L-653 | 7a | 二重送信を `useRef` の同期フラグで防ぐ |
| L-836 / L-858 | 1 | 本文の正規化と長さ判定を共有関数で、正規化後に上限 |
| L-859 / L-775 | 7a | 返信下書きをスレッド ID キーで保持 |
| L-862 | 2 | 上限・存在の判定と INSERT を 1 文に |
| L-901 | 3b, 3c | 全経路を `resolveAccess` に集め、SQL は常に `shared_map_id` で絞る |
| L-1032 | 3b, 3c | 投稿者はサーバーが設定、本人・所有者だけが変更 |
| L-1211 | 8b | ダイアログ表示中は背後の編集ショートカットを止める |
| L-017 / L-029 | 3c | 平文トークンをレートキーに載せない。ストアの例外の生メッセージを応答・UI に出さない |

## File Map

| 領域 | 主なファイル |
|---|---|
| ドメイン | `client/src/domain/share/`（`shareLinkPermission.ts`・`shareComment.ts`・`shareCommentLimits.ts`・`normalizeShareCommentBody.ts`・`normalizeShareCommentAuthorName.ts`・`shareCommentCapabilities.ts`・`classifyShareCommentThreads.ts`・`shareCommentListMutations.ts`・`shareCommentMessages.ts`・`shareCommentOperationMessages.ts`・`shareCommentsOpenGuards.ts`、変更 `shareSession.ts`・`planShareLinkCreate.ts`・`shareLink.ts`・`planShareViewLoad.ts`・`shareDialogModel.ts`・`shareMessages.ts`、削除 `assertViewPermission.ts`） |
| D1 | 変更 `client/src/services/share/d1Client.ts`、新規 `client/src/server/share/shareCommentStore.ts`・`testing/memoryShareCommentStore.ts` |
| サーバー | 変更 `shareService.ts`・`handleShareApi.ts`・`shareResponses.ts`・`shareRateLimit.ts`・`createShareApiDeps.ts`、新規 `resolveShareLinkByToken.ts`・`loadCurrentShareDocument.ts`・`shareCommentService.ts`・`handleShareCommentsApi.ts` |
| Route Handlers | 新規 `client/src/app/api/share/view/[token]/comment-threads/**`・`view/[token]/comments/[commentId]/route.ts`・`maps/[id]/comment-threads/**`・`maps/[id]/comments/[commentId]/route.ts` |
| クライアント | 変更 `shareApiClient.ts`、新規 `shareCommentsApiClient.ts` |
| 所有者 UI | 変更 `ShareDialog.tsx`・`useMapEditorShare.ts`・`MapEditor.tsx`・`NodeDetailPanel.tsx`・`MapStage.tsx`・`mapEditorModalBlocking.ts`、新規 `useMapEditorComments.ts`・`CommentsControl.tsx`・`MapCommentsDialog.tsx`・`NodeCommentsSection.tsx` |
| 描画 | 変更 `renderMapNodes.ts`・`renderMapScene.ts`・`useRenderedMapScene.ts` |
| 閲覧シェル | 変更 `ShareViewerPage.tsx`・`ShareViewer.tsx`・`ShareMapView.tsx`・`ShareOutlineView.tsx`、新規 `useShareViewerComments.ts`・`ShareCommentsPanel.tsx`・`ShareCommentThreadList.tsx`・`ShareCommentComposer.tsx`・`useShareCommenterSession.ts` |
| docs | `share-setup.md`・`features.md`・`api.md`・`browser-test-cases.md`・`ROADMAP.md`・棚卸し |

## Review Focus

1. view リンク・失効トークン・他人のマップでコメントに届かない（404）。所有者でも view リンク経由では 404。
2. `sub`・メールが応答に出ない。表示名をクライアントから受け取らない。
3. comment リンクの再発行で権限が view に落ちない。
4. Phase 38 の DDL 未実行でも共有解除が成功する（`no such table` だけ許容）。
5. 閲覧シェルに所有者 UI・編集入口が無い。view リンクではコメント UI が 0 件。
6. 古い一覧応答が書込み結果を上書きしない。返信の下書きが差し替えで消えない。

---

### Task 0: 棚卸しの確認

**Files:**
- Modify: `docs/superpowers/specs/2026-11-27-phase38-comments-inventory.md`（チェック欄・差分の追記のみ）

**Interfaces:** 受け取るもの: なし。次へ渡すもの: 確認済みの棚卸し（以降の Task の入口・ファイル一覧の正本）。

**Steps:**
- [x] 棚卸し第 1 部の「変更」「参照」に挙がった既存ファイル・関数が実在し、名前が一致することを `rg` で確かめる（例: `rg -n "export function createShareService|function requireOwnedMap|export function planShareLinkCreate|export function assertViewPermission" client/src`）。
- [x] 食い違いがあれば棚卸しの該当行を事実に合わせて直し、末尾に「Task 0 で確認した差分」節として列挙する（無ければ「差分なし」と 1 行）。
- [x] コードは変更しない。

**完了条件:** 棚卸しの各行が実在のファイル・関数を指している。

---

### Task 1: ドメイン（純関数・型・文言）

**Files:**
- Create: `client/src/domain/share/shareLinkPermission.ts`、`shareComment.ts`、`shareCommentLimits.ts`、`normalizeShareCommentBody.ts`、`normalizeShareCommentAuthorName.ts`、`shareCommentCapabilities.ts`、`classifyShareCommentThreads.ts`、`shareCommentListMutations.ts`、`shareCommentMessages.ts`、`shareCommentOperationMessages.ts`、`shareCommentsOpenGuards.ts`
- Create tests: `client/src/domain/share/__tests__/` に上の各ファイルの `*.test.ts`
- Modify: `shareSession.ts`（`ShareCommenter` 系）、`planShareLinkCreate.ts`、`shareLink.ts`、`client/src/server/share/shareService.ts`（呼び出し元の置換のみ）
- Delete: `client/src/domain/share/assertViewPermission.ts`（あればそのテストも）
- Modify tests: `ShareLinkIssued` を作る fixture（`rg -n "linkId:" client/src --glob "*test*"` で探す。`useMapEditorShare.test.tsx`・`ShareDialog.test.tsx`・`handleShareApi.test.ts`・`MapEditorShare.test.tsx` など）

**Interfaces:**（次の Task へ渡すもの）

```ts
// shareLinkPermission.ts
export type ShareLinkPermission = "view" | "comment";
export function parseShareLinkPermission(value: string): ShareLinkPermission | null; // 完全一致のみ。"View" や "edit" は null
export function assertIssuableLinkPermission(value: string): ShareResult<ShareLinkPermission>; // null 相当は { ok:false, reason:"invalid-permission" }
export function linkPermissionAllowsComments(permission: ShareLinkPermission): boolean; // "comment" のみ true

// planShareLinkCreate.ts（入力に permission を追加）
export type ShareLinkCreatePlan = {
  id: string; sharedMapId: string; tokenHash: string;
  permission: ShareLinkPermission; expiresAt: null;
};
export function planShareLinkCreate(input: {
  id: string; sharedMapId: string; token: string; secret: string; permission: ShareLinkPermission;
}): ShareLinkCreatePlan;

// shareLink.ts
export type ShareLinkIssued = { linkId: string; url: string; token: string; permission: ShareLinkPermission };

// shareSession.ts（既存 toShareSession / requireOwner は変えない）
export type ShareCommenter = { userId: string; displayName: string | null };
export function toShareCommenter(
  user: { id?: string | null; name?: string | null } | undefined | null,
): ShareCommenter | null; // id が非空文字列でなければ null。name が非空文字列でなければ displayName: null
export function requireCommenter(commenter: ShareCommenter | null): ShareResult<ShareCommenter>; // null → "unauthenticated"

// shareCommentLimits.ts
export const SHARE_COMMENT_BODY_MAX_LENGTH = 2000;          // UTF-16 コード単位
export const SHARE_COMMENT_BODY_RAW_MAX_LENGTH = 8000;      // 正規化前の早期拒否
export const SHARE_COMMENT_AUTHOR_NAME_MAX_CODE_POINTS = 50;
export const SHARE_COMMENT_NODE_LABEL_SNAPSHOT_MAX_CODE_POINTS = 80;
export const SHARE_COMMENT_MAX_THREADS_PER_MAP = 200;
export const SHARE_COMMENT_MAX_COMMENTS_PER_MAP = 1000;
export const SHARE_COMMENT_MAX_COMMENTS_PER_THREAD = 50;
export const SHARE_COMMENT_MAX_BODY_BYTES = 16 * 1024;

// normalizeShareCommentBody.ts
export type ShareCommentBodyResult =
  | { ok: true; value: string }
  | { ok: false; reason: "empty" | "too-long" };
export function normalizeShareCommentBody(raw: string): ShareCommentBodyResult;

// normalizeShareCommentAuthorName.ts（サーバー専用）
export const SHARE_COMMENT_AUTHOR_NAME_FALLBACK = "名前未設定";
export function normalizeShareCommentAuthorName(name: string | null): string;

// normalizeShareCommentNodeLabel.ts（サーバーのスナップショット作成とクライアントの現在ラベル表示で使う）
export const SHARE_COMMENT_NODE_LABEL_FALLBACK = "（無題）";
export function normalizeShareCommentNodeLabel(label: string): string;

// shareComment.ts（API 応答の正本。server / client 共用）
export type ShareCommentsScope =
  | { kind: "token"; token: string }
  | { kind: "owner"; sharedMapId: string };
export type ShareCommentView = {
  readonly id: string; readonly authorName: string; readonly body: string;
  readonly createdAt: string; readonly canDelete: boolean;
};
export type ShareCommentThreadView = {
  readonly id: string; readonly nodeId: number; readonly nodeLabelSnapshot: string;
  readonly status: "open" | "resolved";
  readonly resolvedByName: string | null; readonly resolvedAt: string | null;
  readonly createdAt: string; readonly updatedAt: string;
  readonly canResolve: boolean;
  readonly comments: readonly ShareCommentView[];
};
export type ShareCommentViewer = { readonly signedIn: boolean; readonly canPost: boolean; readonly isOwner: boolean };
export type ShareCommentListValue = {
  readonly threads: readonly ShareCommentThreadView[];
  readonly viewer: ShareCommentViewer;
};
export type ShareCommentDeleteValue = { readonly commentId: string; readonly threadDeleted: boolean };
/** 一覧の取得状態（閲覧シェル・所有者の hook が共用） */
export type ShareCommentsListState = "idle" | "loading" | "ready" | "error";

// shareCommentCapabilities.ts（能力判定の唯一の純関数。一覧の算出と書込み時の再検査の両方で使う）
export type ShareCommentCapabilitiesInput = {
  readonly viewerUserId: string | null;          // 未ログインは null
  readonly isOwner: boolean;
  readonly threadCreatedByUserId: string;
  readonly commentAuthorUserId: string | null;   // スレッド単位の判定だけなら null
};
export type ShareCommentCapabilities = { readonly canResolve: boolean; readonly canDelete: boolean };
export function resolveShareCommentCapabilities(input: ShareCommentCapabilitiesInput): ShareCommentCapabilities;
// canResolve = isOwner || (viewerUserId !== null && viewerUserId === threadCreatedByUserId)
// canDelete  = commentAuthorUserId !== null && (isOwner || (viewerUserId !== null && viewerUserId === commentAuthorUserId))

// classifyShareCommentThreads.ts
export type ClassifiedShareCommentThreads = {
  readonly attached: ReadonlyMap<number, readonly ShareCommentThreadView[]>; // 文書にあるノード
  readonly orphaned: readonly ShareCommentThreadView[];                        // 削除されたノード
};
export function classifyShareCommentThreads(
  threads: readonly ShareCommentThreadView[], nodeIds: ReadonlySet<number>,
): ClassifiedShareCommentThreads; // 入力の順序を保つ
export function countOpenThreadsByNode(
  attached: ClassifiedShareCommentThreads["attached"],
): ReadonlyMap<number, number>; // status "open" だけ数え、0 のノードはキーを持たない

// shareCommentListMutations.ts
export function replaceThreadInList(
  threads: readonly ShareCommentThreadView[], thread: ShareCommentThreadView,
): ShareCommentThreadView[]; // 同 id を置換。無ければ createdAt 昇順（同値は id 昇順）の位置へ挿入
export function removeCommentFromList(
  threads: readonly ShareCommentThreadView[], threadId: string, commentId: string, threadDeleted: boolean,
): ShareCommentThreadView[]; // threadDeleted またはコメント 0 件になったらスレッドごと除く

// shareCommentMessages.ts
export const SHARE_COMMENT_MESSAGES = {
  title: "コメント",
  loading: "コメントを読み込んでいます…",
  empty: "まだコメントはありません。",
  loadFailed: "コメントを読み込めませんでした。",
  reload: "再読み込み",
  sessionLoading: "ログイン状態を確認しています…",
  loginRequired: "コメントするには Google でログインしてください。",
  loginButton: "Google でログイン",
  nameVisibilityNotice: "名前（Google アカウントの名前）はこのリンクを知っている人に表示されます。",
  selectNodeHint: "ノードを選ぶとコメントを書けます",
  filterSelected: "選択中のノード",
  filterAll: "すべて",
  filterLegend: "絞り込み",
  resolvedSection: "解決済み",
  orphanedSection: "削除されたノード",
  orphanedPrefix: "削除されたノード: ",
  snapshotPrefix: "コメント時: ",
  submit: "送信",
  reply: "返信",
  resolve: "解決",
  reopen: "再開",
  delete: "削除",
  deleteConfirm: "このコメントを削除しますか？",
  deleteConfirmYes: "削除する",
  deleteConfirmNo: "キャンセル",
  remaining: "残り",
  createSuccess: "コメントを投稿しました。",
  replySuccess: "返信しました。",
  resolveSuccess: "解決しました。",
  reopenSuccess: "再開しました。",
  deleteSuccess: "削除しました。",
  notSharedDisabled: "共有中のマップだけコメントを使えます",
  learnBlocked: "学習モード中はコメントを開けません。",
  presentationBlocked: "プレゼン再生中はコメントを開けません。",
  openComments: "コメントを開く",
  resolvedBy: "解決: ",
  statusOpen: "未解決",
  statusResolved: "解決済み",
  selectThreadNode: "このノードを選択",
} as const; // このオブジェクトのキーと文言が正本
export type ShareCommentMessageKey = keyof typeof SHARE_COMMENT_MESSAGES;
// shareCommentOperationMessages.ts
export function shareCommentOperationFailureMessage(reason: string): string;
// shareCommentsOpenGuards.ts
export type CommentsOpenBlockedReason = "learning" | "presentation";
export function resolveCommentsOpenBlocked(input: { learningActive: boolean; playingPresentation: boolean }): CommentsOpenBlockedReason | null;
export function commentsOpenBlockedMessage(reason: CommentsOpenBlockedReason): string;
```

**Steps:**
- [x] `shareLinkPermission.test.ts`: `view`・`comment` は通り、`edit`・`""`・`"View"`・`"comment "` は `parseShareLinkPermission` で null、`assertIssuableLinkPermission` で `invalid-permission`。`linkPermissionAllowsComments` は comment のみ true。RED を確認。
- [x] `normalizeShareCommentBody.test.ts`（設計 §5.5）:
  - 8,001 文字の生入力は正規化前に `too-long`（空白だけの 8,001 文字でも `too-long`）。
  - `"a\r\nb\rc"` → `"a\nb\nc"`。
  - 制御文字: U+0000・U+0007・U+001B・U+007F・U+0085・U+009F は除かれ、`\t` と `\n` は残る。
  - 前後の空白・改行は除き、内側の改行は残る。空白と改行だけなら `empty`。
  - 正規化後ちょうど 2,000 は ok、2,001 は `too-long`。`"😀"`（UTF-16 で 2）を 1,000 個は ok、1,000 個＋`"a"` は `too-long`。前後空白を除いた結果が 2,000 なら ok（正規化後に数える）。切り詰めない。
- [x] `normalizeShareCommentAuthorName.test.ts`: C0（タブ・改行を含む）・U+007F・C1 を除く、前後空白を除く、`Array.from` のコードポイントで 50 に切る（サロゲートペアを割らない）、空・null は「名前未設定」。ラベルは改行（`\n`・`\r`）を空白にしてから同じ除去、80 コードポイント、空は「（無題）」。
- [x] `shareCommentCapabilities.test.ts`: `resolveShareCommentCapabilities` を所有者 / 作成者 / 投稿者 / 他人 / 未ログイン（`viewerUserId: null`）× `commentAuthorUserId` あり / null の表で固定する。
- [x] `classifyShareCommentThreads.test.ts`: 文書に無い nodeId は orphaned、順序保持、resolved は数えない、0 件はキー無し。
- [x] `shareCommentListMutations.test.ts`: 置換・挿入位置・コメント削除・最後のコメント削除でスレッドも消える・`threadDeleted: true` で消える。入力配列を破壊しない。
- [x] `shareSession.test.ts` に追記: `toShareCommenter` の id 欠落・空 → null、name 欠落 → `displayName: null`、`requireCommenter(null)` → `unauthenticated`。
- [x] `shareCommentOperationMessages.test.ts`: reason ごとの文言（設計 §7.5 の一覧どおり）。未知の reason は「コメントの操作に失敗しました。」。
- [x] `shareCommentsOpenGuards.test.ts`: 学習を先に判定、どちらも偽なら null、文言は「学習モード中はコメントを開けません。」「プレゼン再生中はコメントを開けません。」。
- [x] RED を確認してから各ファイルを実装する。`SHARE_COMMENT_MESSAGES` は Interfaces のオブジェクトをそのまま書く（キーと文言の正本。型は `typeof SHARE_COMMENT_MESSAGES`。キーを足すときは Interfaces にも足す）。
- [x] 呼び出し元の置換（同じ Task）:
  - `assertViewPermission.ts` を削除する。`shareService.ts` の `createLink` は `assertIssuableLinkPermission(permission)` を使い、**この Task では** 結果が `"view"` 以外なら `{ ok: false, reason: "invalid-permission" }` を返す（comment の許可は Task 3a）。`viewByToken` は `parseShareLinkPermission(link.permission) !== "view"` なら `not-found`（comment の許可は Task 3a）。
  - `planShareLinkCreate` の呼び出し: `createShare`・`createLink`・`reissueLink` は `permission: "view"` を渡す。`viewByToken` の probe 呼び出しは `tokenHash(token, tokenSecret)` の直接呼び出しに置き換える。
  - `shareService.ts` の `toIssued(linkId, token, origin)` を `toIssued(linkId, token, origin, permission)` にし、`permission` を詰める。
  - `ShareLinkIssued` を作るテスト fixture に `permission: "view"` を足す。
- [x] 検証: `cd client && npx tsc --noEmit && npx jest src/domain/share src/server/share src/hooks/__tests__/useMapEditorShare.test.tsx src/components/layout/__tests__/ShareDialog.test.tsx src/components/map/__tests__/MapEditorShare.test.tsx`

**完了条件:** 新規ドメインのテストが通り、既存の共有テストが挙動を変えずに通る。`assertViewPermission` への参照が 0 件（`rg assertViewPermission client/src` が空）。

---

### Task 2: D1 のコメントストア

**Files:**
- Modify: `client/src/services/share/d1Client.ts`、`client/src/services/share/__tests__/d1Client.test.ts`
- Create: `client/src/server/share/shareCommentStore.ts`、`client/src/server/share/testing/memoryShareCommentStore.ts`
- Create tests: `client/src/server/share/__tests__/shareCommentStore.test.ts`、`client/src/server/share/__tests__/memoryShareCommentStore.test.ts`

**Interfaces:** 受け取るもの: Task 1 の `shareCommentLimits.ts`。次へ渡すもの:

```ts
// d1Client.ts
export type D1QueryErrorKind = "no-such-table" | "failed";
export class D1QueryError extends Error {
  readonly kind: D1QueryErrorKind;
  constructor(kind: D1QueryErrorKind); // message は常に "d1-query-failed"、name は "D1QueryError"
}
export function isD1MissingTableError(error: unknown): boolean; // error instanceof D1QueryError && kind === "no-such-table"

// shareCommentStore.ts
export type ShareCommentThreadRecord = {
  id: string; sharedMapId: string; nodeId: number; nodeLabelSnapshot: string;
  status: "open" | "resolved"; createdByUserId: string; createdAt: string; updatedAt: string;
  resolvedByUserId: string | null; resolvedByName: string | null; resolvedAt: string | null;
};
export type ShareCommentRecord = {
  id: string; threadId: string; sharedMapId: string;
  authorUserId: string; authorName: string; body: string; createdAt: string;
};
export type ShareCommentStore = {
  listThreadsByMap(sharedMapId: string): Promise<ShareCommentThreadRecord[]>;   // created_at, id 昇順
  listCommentsByMap(sharedMapId: string): Promise<ShareCommentRecord[]>;        // created_at, id 昇順
  getThread(sharedMapId: string, threadId: string): Promise<ShareCommentThreadRecord | null>;
  getComment(sharedMapId: string, commentId: string): Promise<ShareCommentRecord | null>;
  listCommentsByThread(sharedMapId: string, threadId: string): Promise<ShareCommentRecord[]>;
  /** 上限内なら INSERT して true。上限なら false（1 文の INSERT ... SELECT ... WHERE） */
  insertThreadWithinLimits(row: ShareCommentThreadRecord): Promise<boolean>;
  /** スレッドが同じマップに存在し open で、上限内なら INSERT して true。それ以外 false（1 文） */
  insertCommentWithinLimits(row: ShareCommentRecord): Promise<boolean>;
  /** 戻り値は changes */
  resolveThread(sharedMapId: string, threadId: string, resolved: { userId: string; name: string; at: string }): Promise<number>;
  reopenThread(sharedMapId: string, threadId: string, updatedAt: string): Promise<number>;
  deleteComment(sharedMapId: string, commentId: string): Promise<number>;
  deleteThreadIfEmpty(sharedMapId: string, threadId: string): Promise<number>;
  /** 補償用（API からは呼ばない） */
  deleteThread(sharedMapId: string, threadId: string): Promise<number>;
  deleteCommentsByMap(sharedMapId: string): Promise<void>;
  deleteThreadsByMap(sharedMapId: string): Promise<void>;
};
export function readD1Changes(meta: unknown): number; // meta.changes が安全な非負整数でなければ throw new D1QueryError("failed")
export function createCloudflareShareCommentStore(d1: D1Client): ShareCommentStore;

// testing/memoryShareCommentStore.ts
export type MemoryShareCommentStore = ShareCommentStore & {
  readonly threads: ShareCommentThreadRecord[]; // テストから直接見る・仕込む
  readonly comments: ShareCommentRecord[];
};
export function createMemoryShareCommentStore(options?: {
  /** true なら全メソッドが D1QueryError("no-such-table") を投げる（DDL 未実行の再現） */
  missingTables?: boolean;
  /** 指定したメソッド名の次の 1 回だけ D1QueryError("failed") を投げる */
  failOnce?: ReadonlyArray<keyof ShareCommentStore>;
}): MemoryShareCommentStore;
```

**Steps:**
- [x] D1 REST の公式ドキュメント（Cloudflare の公式サイトのトップから D1 → REST API → query database）で、失敗応答 `{ success: false, errors: [{ code, message }] }` と成功応答の `result[0].meta.changes` の形を確かめ、テストのコメントに根拠（ドキュメントの節名と確認日）を書く（L-059）。既存 `d1Client.ts` のパース（`body.result[0]`）と矛盾しないことも確かめる。
- [x] `d1Client.test.ts` に追記（RED）: `errors[0].message` に `no such table: share_comments` を含む失敗応答で `D1QueryError` の `kind === "no-such-table"`、それ以外の失敗・fetch の例外・JSON でない本文で `kind === "failed"`、どちらも `message === "d1-query-failed"`（生メッセージを載せない）。既存の `toThrow("d1-query-failed")` はそのまま通ること。
- [x] `d1Client.ts` を実装: 失敗時に `body.errors` が配列なら各要素の `message`（文字列のときだけ）を小文字化して `"no such table"` を含むか見る。
- [x] `shareCommentStore.test.ts`（RED）: `D1Client` のモック（`exec` の呼び出しを記録し、`results` と `meta` を返す）で、各メソッドの SQL と params を確かめる。必須の観点:
  - すべての SELECT / UPDATE / DELETE が `shared_map_id = ?` を条件に持つ（`deleteThreadIfEmpty` は内側の `NOT EXISTS` にも持つ）。
  - `insertThreadWithinLimits` は 1 文の `INSERT INTO share_comment_threads (...) SELECT ?, ?, ... WHERE (SELECT COUNT(*) FROM share_comment_threads WHERE shared_map_id = ?) < ? AND (SELECT COUNT(*) FROM share_comments WHERE shared_map_id = ?) < ?` で、上限は `SHARE_COMMENT_MAX_THREADS_PER_MAP` / `SHARE_COMMENT_MAX_COMMENTS_PER_MAP`。`meta.changes` 1 → true、0 → false。
  - `insertCommentWithinLimits` は `WHERE EXISTS (SELECT 1 FROM share_comment_threads WHERE id = ? AND shared_map_id = ? AND status = 'open') AND (SELECT COUNT(*) FROM share_comments WHERE thread_id = ? AND shared_map_id = ?) < ? AND (SELECT COUNT(*) FROM share_comments WHERE shared_map_id = ?) < ?`。
  - `resolveThread` は `... WHERE id = ? AND shared_map_id = ? AND status = 'open'`、`reopenThread` は `status = 'resolved'` 条件で resolved_* を NULL に。
  - `readD1Changes`: `{ changes: 1 }` → 1、`{}`・`{ changes: "1" }`・`{ changes: -1 }`・`{ changes: 1.5 }`・`null` → `D1QueryError("failed")`。
  - 行の写像（snake_case → camelCase、`node_id` は number）。
- [x] `memoryShareCommentStore.test.ts`（RED）: D1 と同じ意味（上限・open 条件・`shared_map_id` の絞り込み・changes の値・`missingTables`・`failOnce`）。
- [x] 実装して GREEN。
- [x] 検証: `cd client && npx tsc --noEmit && npx jest src/services/share src/server/share/__tests__/shareCommentStore.test.ts src/server/share/__tests__/memoryShareCommentStore.test.ts`

**完了条件:** モックの期待値の根拠がテストに書かれ、ストアの全 SQL が `shared_map_id` で絞られている。

---

### Task 3a: 既存の共有 API の変更

**Files:**
- Create: `client/src/server/share/resolveShareLinkByToken.ts`、`client/src/server/share/loadCurrentShareDocument.ts`
- Modify: `client/src/server/share/shareService.ts`、`client/src/server/share/handleShareApi.ts`、`client/src/server/share/__tests__/handleShareApi.test.ts`

**Interfaces:** 受け取るもの: Task 1 の `ShareLinkPermission` 系・`planShareLinkCreate`・`ShareLinkIssued`、Task 2 の `ShareCommentStore`・`createCloudflareShareCommentStore`・`createMemoryShareCommentStore`・`isD1MissingTableError`。次へ渡すもの:

```ts
// resolveShareLinkByToken.ts
export function resolveShareLinkByToken(
  store: ShareStore, token: string, tokenSecret: string,
): Promise<ShareResult<{ link: ShareLinkRecord; map: SharedMapRecord; permission: ShareLinkPermission }>>;
// 空トークン・不明・revoked・未知の permission・マップ無し・currentRevisionId null → not-found。
// store の例外 → storage-error。

// loadCurrentShareDocument.ts
export function loadCurrentShareDocument(
  store: ShareStore, map: SharedMapRecord,
): Promise<ShareResult<{ documentJson: string }>>;
// currentRevisionId null・revision 無し・R2 に無し → not-found。sha256 不一致 → storage-error。例外 → storage-error。

// shareService.ts
export async function requireOwnedMap(store: ShareStore, session: ShareSession, mapId: string): Promise<ShareResult<SharedMapRecord>>; // 既存関数を export
export type ShareServiceDeps = {
  store: ShareStore; commentStore: ShareCommentStore; // commentStore は必須
  tokenSecret: string; publicOrigin: string;
  nowIso?: () => string; createId?: () => string; createToken?: () => string;
};
// viewByToken(token): Promise<ShareResult<{ documentJson: string; permission: ShareLinkPermission }>>
// createLink(session, mapId, { permission?: string }) は "view" と "comment" を発行できる。
// reissueLink は旧リンクの permission を引き継ぎ、成功値 ShareLinkIssued.permission に入れる。

// handleShareApi.ts
export type ShareApiDeps = { /* 既存の項目 */ commentStore?: ShareCommentStore /* 省略時は createCloudflareShareCommentStore(d1) */ };
export async function readJsonBody(request: Request, maxBodyBytes: number): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }>; // export のみ
export function asRecord(value: unknown): Record<string, unknown> | null; // export のみ
export function withViewResponseHeaders(response: Response): Response;  // export のみ
```

**Steps:**
- [x] `handleShareApi.test.ts` に追記（RED）:
  - `POST /api/share/maps/:id/links` に `{ permission: "comment" }` で 200、成功値の `permission === "comment"`。`"edit"` は 400 `invalid-permission`。省略時は `"view"`。
  - comment リンクを再発行すると新リンクの `permission` が `"comment"`（成功値と `GET /api/share/maps` の一覧の両方）。view も view のまま。
  - `GET /api/share/view/:token` の成功値に `permission`（view / comment）。comment リンクでも文書が返る。DB に `permission: "edit"` の行を直接仕込んだトークンは 404。同じ `edit` のリンクを `POST /api/share/links/:id/reissue` すると 404 で、新リンクは作られず旧リンクも失効しない。
  - 共有解除で、そのマップのコメントとスレッドが `commentStore` から消え、別マップの行は残る。
  - `createMemoryShareCommentStore({ missingTables: true })` で共有解除が 200（`no-such-table` を許容）。`failOnce: ["deleteCommentsByMap"]` では 502 `storage-error`。
  - 既存の閲覧・失効・sha256 不一致のテストが変わらず通る（切り出しの回帰確認）。
- [x] `deps()` に `commentStore: createMemoryShareCommentStore()` を足し、テスト内の `createShareService` 呼び出しにも `commentStore` を渡す。
- [x] 実装:
  - `viewByToken` の中のトークン解決と文書読込を 2 つの新規関数へ移し、`viewByToken` はそれを呼ぶだけにする。返す `permission` は `resolveShareLinkByToken` の値。
  - `createLink`: `assertIssuableLinkPermission(input.permission ?? "view")` の値で `planShareLinkCreate` を呼ぶ。
  - `reissueLink`: `parseShareLinkPermission(owned.value.link.permission)` が null なら `not-found`、それ以外をそのまま使う。
  - `deleteShare`: `deleteRevisionsByMap` の後・`deleteMap` の前に、`commentStore.deleteCommentsByMap` → `commentStore.deleteThreadsByMap` を呼ぶ。各呼び出しの例外が `isD1MissingTableError` なら無視して次へ進み、それ以外は従来どおり `storage-error`。
  - `requireOwnedMap` を export する。`resolveService` は `deps.commentStore ?? createCloudflareShareCommentStore(deps.d1)` を渡す。`readJsonBody`・`asRecord`・`withViewResponseHeaders` を export する（中身は変えない）。
- [x] 検証: `cd client && npx tsc --noEmit && npx jest src/server/share`

**完了条件:** comment リンクの発行・再発行の引継ぎ・view 応答の permission・共有解除のコメント削除が既存 API のテストで固定され、既存のテストが全部通る。

---

### Task 3b: コメントサービス

**Files:**
- Create: `client/src/server/share/shareCommentService.ts`、`client/src/server/share/__tests__/shareCommentService.test.ts`

**Interfaces:** 受け取るもの: Task 1 の全ドメイン、Task 2 の `ShareCommentStore`・`createMemoryShareCommentStore`、Task 3a の `resolveShareLinkByToken`・`loadCurrentShareDocument`・`requireOwnedMap`。既存 `createMemoryShareStore`（`client/src/server/share/testing/memoryShareStore.ts`）と `parseMapDocumentJson`（`client/src/domain/persistence/mapDocumentCodec.ts`）。次へ渡すもの:

```ts
export type CommentAccess = {
  readonly map: SharedMapRecord;
  readonly actor: { readonly userId: string; readonly displayName: string } | null; // displayName は normalizeShareCommentAuthorName 済み
  readonly isOwner: boolean;
  readonly via: "token" | "owner";
};
export type ShareCommentServiceDeps = {
  store: ShareStore;
  commentStore: ShareCommentStore;
  tokenSecret: string;
  getSession: () => Promise<ShareSession>;
  getCommenter: () => Promise<ShareCommenter | null>;
  nowIso?: () => string;
  createId?: () => string;
};
export type ShareCommentService = {
  resolveAccess(scope: ShareCommentsScope, options: { requireActor: boolean }): Promise<ShareResult<CommentAccess>>;
  list(access: CommentAccess): Promise<ShareResult<ShareCommentListValue>>;
  createThread(access: CommentAccess, input: { nodeId: number; body: string }): Promise<ShareResult<ShareCommentThreadView>>;
  reply(access: CommentAccess, threadId: string, input: { body: string }): Promise<ShareResult<ShareCommentThreadView>>;
  resolveThread(access: CommentAccess, threadId: string): Promise<ShareResult<ShareCommentThreadView>>;
  reopenThread(access: CommentAccess, threadId: string): Promise<ShareResult<ShareCommentThreadView>>;
  deleteComment(access: CommentAccess, commentId: string): Promise<ShareResult<ShareCommentDeleteValue>>;
};
export function createShareCommentService(deps: ShareCommentServiceDeps): ShareCommentService;
```

**挙動（設計 §5.3・§5.6・§6）:**
- `resolveAccess`:
  - token: `resolveShareLinkByToken` が失敗ならその結果。`linkPermissionAllowsComments(permission)` が false なら `not-found`（所有者でも）。`commenter = await getCommenter()`。`requireActor` かつ null なら `unauthenticated`。`isOwner = commenter?.userId === map.ownerUserId`。
  - owner: `session = await getSession()` → `requireOwnedMap(store, session, scope.sharedMapId)` の失敗はその結果（未ログイン 401・他人 404）。`commenter = await getCommenter()` が null または `commenter.userId !== session.userId` なら `unauthenticated`。`isOwner = true`。
  - `actor` は commenter があれば `{ userId, displayName: normalizeShareCommentAuthorName(commenter.displayName) }`、無ければ null。
- `list`: `listThreadsByMap` と `listCommentsByMap` をまとめ、コメント 0 件のスレッドと、スレッドに属さないコメントは返さない。`canResolve` と `canDelete` は `resolveShareCommentCapabilities({ viewerUserId: actor?.userId ?? null, isOwner, threadCreatedByUserId, commentAuthorUserId })` から取る。`viewer = { signedIn: actor !== null, canPost: actor !== null, isOwner }`。応答に userId 系を入れない。
- `createThread`: `actor` が null なら `unauthenticated`。`normalizeShareCommentBody` 失敗は `invalid-comment`。`map.currentRevisionId === null` は `not-published`。`loadCurrentShareDocument` → `parseMapDocumentJson`（失敗は `storage-error`）→ `nodes` に `nodeId` が無ければ `invalid-node`。`node_label_snapshot = normalizeShareCommentNodeLabel(node.label)`。`insertThreadWithinLimits` が false → `comment-limit`。続けて最初のコメントを `insertCommentWithinLimits`。false または例外なら `deleteThread` で補償し、false は `comment-limit`、例外は `storage-error`（補償の失敗は握りつぶして同じ reason）。成功はスレッドを読み直して View で返す。
- `reply`: actor 必須。本文検証。`insertCommentWithinLimits` が false のときだけ `getThread` で理由を分ける（無い → `not-found`、resolved → `thread-resolved`、それ以外 → `comment-limit`）。成功は読み直して返す。
- `resolveThread` / `reopenThread`: actor 必須。(0) `getThread` が null、または `resolveShareCommentCapabilities({ ..., commentAuthorUserId: null }).canResolve` が false → `not-found`。(1) 更新（changes 0 は冪等成功）。(2) 読み直し、null なら `not-found`。解決者名は `actor.displayName`。
- `deleteComment`: actor 必須。(0) `getComment` が null、または `getThread` で読んだスレッドを使った `resolveShareCommentCapabilities(...).canDelete` が false → `not-found`。(1) `deleteComment` の changes が 0 → `not-found`。(2) `deleteThreadIfEmpty`。例外なら `threadDeleted: false` で成功（L-575）、changes 1 なら `threadDeleted: true`。
- ストアの例外はすべて `storage-error`（`try/catch` で包む）。時刻は `nowIso()`、ID は `createId()`（既定は `crypto.randomUUID()`）。

**Steps:**
- [x] `shareCommentService.test.ts`（RED）: `createMemoryShareStore` に共有済みマップ（view リンク 1 本・comment リンク 1 本・現行 revision の文書にノード ID 1・2）を作るヘルパと、`createMemoryShareCommentStore` を使う。観点:
  - `resolveAccess`: §6.2 の主体ごと（所有者経路の未ログイン 401・他人 404・`getCommenter` null / 食い違い 401、トークン経路の view リンク 404（所有者がログインしていても 404）・失効 404・未公開 404・未知の permission 404・comment 未ログインの一覧は actor null・書込みは 401）。
  - 能力: 作成者だけが解決・再開、投稿者だけが削除、所有者は全部。他人は 404。
  - 上限: スレッド 200・マップのコメント 1,000・スレッドのコメント 50 で `comment-limit`（ストアの配列に直接仕込む）。
  - 補償: `failOnce: ["insertCommentWithinLimits"]` でスレッドが残らない。
  - 冪等: 解決済みの解決・open の再開は成功で、解決者は上書きされない。
  - 消失: (0) の後に対象を消すと 404（ストアをラップして `getThread` の直後に配列から消す）。
  - 最後のコメント削除で `threadDeleted: true`、`failOnce: ["deleteThreadIfEmpty"]` で `threadDeleted: false` の成功。
  - `invalid-node`・`not-published`・`invalid-comment`・`thread-resolved`。
  - 別マップ: 同じ所有者のマップ B のスレッド ID・コメント ID を、マップ A の access（owner 経路・token 経路の両方で解決したもの）で返信・解決・再開・削除すると 404 で、B の行は変わらない。
  - 空スレッドと孤立コメント: `failOnce: ["insertCommentWithinLimits", "deleteThread"]` で作成に失敗して残ったコメント 0 件のスレッドと、`comments` に直接仕込んだスレッドの無いコメントが `list` に出ない。
  - 応答の JSON 文字列に投稿者の userId とメールが含まれない。
- [x] 実装して GREEN。HTTP 層からはまだ呼ばない。
- [x] 検証: `cd client && npx tsc --noEmit && npx jest src/server/share/__tests__/shareCommentService.test.ts`

**完了条件:** サービスの単体テストで能力・上限・補償・冪等・消失時の 404 が固定されている。

---

### Task 3c: コメント API の HTTP 層と Route Handler

**Files:**
- Create: `client/src/server/share/handleShareCommentsApi.ts`、`client/src/server/share/__tests__/handleShareCommentsApi.test.ts`
- Modify: `client/src/server/share/shareResponses.ts`、`client/src/server/share/shareRateLimit.ts`、`client/src/server/share/createShareApiDeps.ts`、`client/src/server/share/handleShareApi.ts`（`ShareApiDeps` の型）、`client/src/server/share/__tests__/handleShareApi.test.ts`（`deps()`）
- Create routes（各ファイルは `export const dynamic = "force-dynamic";` と、`createShareApiDepsFromEnv(process.env, request)` → null なら `notConfiguredResponse()` → ハンドラ呼び出しだけ。既存 `client/src/app/api/share/links/[id]/revoke/route.ts` と同じ形）:
  - `client/src/app/api/share/view/[token]/comment-threads/route.ts`（GET・POST）
  - `client/src/app/api/share/view/[token]/comment-threads/[threadId]/replies/route.ts`（POST）
  - `client/src/app/api/share/view/[token]/comment-threads/[threadId]/resolve/route.ts`（POST）
  - `client/src/app/api/share/view/[token]/comment-threads/[threadId]/reopen/route.ts`（POST）
  - `client/src/app/api/share/view/[token]/comments/[commentId]/route.ts`（DELETE）
  - `client/src/app/api/share/maps/[id]/comment-threads/route.ts`（GET・POST）と、上と同じ形の `maps/[id]/comment-threads/[threadId]/replies|resolve|reopen/route.ts`、`maps/[id]/comments/[commentId]/route.ts`

**Interfaces:** 受け取るもの: Task 3b の `createShareCommentService`・`ShareCommentService`、Task 3a の `ShareApiDeps`・`readJsonBody`・`asRecord`・`withViewResponseHeaders`、既存 `clientIpFromRequest`・`shareResultResponse`・`hasOnlyKeys`（`client/src/domain/shared/unknownRecord.ts`）。次へ渡すもの（Task 4 のクライアントが叩く HTTP 契約）:

```ts
// handleShareApi.ts の ShareApiDeps に追加
getCommenter: () => Promise<ShareCommenter | null>;      // 必須
commentService?: ShareCommentService;                      // テスト用
commentWriteRateLimiter?: ShareRateLimiter;                // 省略時は processShareCommentWriteRateLimiter

// shareRateLimit.ts
export const SHARE_COMMENT_WRITE_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const;
export const processShareCommentWriteRateLimiter: ShareRateLimiter;

// createShareApiDeps.ts
export async function commenterFromAuth(): Promise<ShareCommenter | null>; // toShareCommenter((await auth())?.user)

// handleShareCommentsApi.ts
export function handleListCommentThreads(request: Request, scope: ShareCommentsScope, deps: ShareApiDeps): Promise<Response>;
export function handleCreateCommentThread(request: Request, scope: ShareCommentsScope, deps: ShareApiDeps): Promise<Response>;
export function handleReplyCommentThread(request: Request, scope: ShareCommentsScope, threadId: string, deps: ShareApiDeps): Promise<Response>;
export function handleResolveCommentThread(request: Request, scope: ShareCommentsScope, threadId: string, deps: ShareApiDeps): Promise<Response>;
export function handleReopenCommentThread(request: Request, scope: ShareCommentsScope, threadId: string, deps: ShareApiDeps): Promise<Response>;
export function handleDeleteComment(request: Request, scope: ShareCommentsScope, commentId: string, deps: ShareApiDeps): Promise<Response>;
```

HTTP 契約（設計 §8.2・§8.3）: 成功は 200 で `{ ok: true, value }`。一覧は `ShareCommentListValue`、作成・返信・解決・再開は `ShareCommentThreadView`、削除は `ShareCommentDeleteValue`。

**判定順（全ハンドラ共通・設計 §6.3）:**
1. 経路のレート制限: token は既存 view リミッタで `view:ip:<ip>` → `view:<tokenHash(token, tokenSecret)>`（空トークンは `view:empty`）。owner は `owner:<(await getSession())?.userId ?? "anonymous">`（既存 `withOwnerRateLimit` と同じ）。超過は 429。
2. `resolveAccess(scope, { requireActor: 一覧以外 true })`。
3. 書込みだけ: `comment-write:user:<actor.userId>` → `comment-write:ip:<ip>`（429）。
4. 作成・返信だけ: `Content-Type` の `;` より前を小文字化・trim して `application/json` でなければ `invalid-request`。`readJsonBody(request, SHARE_COMMENT_MAX_BODY_BYTES)`（413 / 400）。`asRecord` 必須。許すキーはモジュール定数 `CREATE_THREAD_KEYS = new Set(["nodeId", "body"])` / `REPLY_KEYS = new Set(["body"])`（`ReadonlySet<string>`）にし、`hasOnlyKeys(record, CREATE_THREAD_KEYS)` / `hasOnlyKeys(record, REPLY_KEYS)`（実シグネチャは `hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean`。`client/src/domain/shared/unknownRecord.ts`）が偽なら `invalid-request`。`hasOnlyKeys` は余計なキーだけを見るので、必須キーの有無は続く型検査で判定する。`nodeId` は `typeof === "number" && Number.isSafeInteger && >= 1`、`body` は文字列でなければ `invalid-request`。本文の正規化はサービスに任せる。
5. サービスの操作関数。resolve・reopen・DELETE は本文を読まず Content-Type も見ない。`threadId` / `commentId` が空文字なら `not-found`。

応答ヘッダー: 全ハンドラで `Cache-Control: private, no-store`。token 経路は `withViewResponseHeaders` で `Referrer-Policy: no-referrer` も付ける。`STATUS_BY_REASON` に `invalid-comment: 400`、`invalid-node: 400`、`thread-resolved: 409`、`comment-limit: 409` を足す。

**Steps:**
- [x] `handleShareCommentsApi.test.ts`（RED）: `handleShareApi.test.ts` の `deps()`・`jsonRequest` と同じ形のヘルパを作る（`getSession`・`getCommenter` を差し替え可能に、リミッタは `createShareRateLimiter` で小さい上限を注入）。
  - 設計 §6.2 の表を 1 セル 1 ケース（2 経路 × 主体 × 操作）。
  - 判定順: view リンク＋未ログインの書込みは 404 で書込み枠を消費しない、comment 未ログインの書込みは 401 で書込み枠を消費しない、書込み枠超過は本文が壊れていても 429。
  - 本文: 16 KiB 超 413、JSON でない 400、`authorName` / `displayName` キー混入 400、`nodeId` が `"1"`・0・1.5 で 400、`Content-Type: text/plain` の作成で 400、resolve / reopen / DELETE は `text/plain` の壊れた本文付きでも成功。
  - reason → HTTP（`invalid-comment` 400・`invalid-node` 400・`thread-resolved` 409・`comment-limit` 409）。
  - ヘッダー: token 経路は成否とも `Cache-Control: private, no-store` と `Referrer-Policy: no-referrer`、owner 経路 GET は `Cache-Control: private, no-store`。
  - 応答本文の文字列に投稿者の userId とメールが含まれない。
  - L-017 / L-029: `take(key)` の引数を記録する `ShareRateLimiter`（常に true を返す）を `viewRateLimiter` と `commentWriteRateLimiter` に注入し、token 経路の全ハンドラを呼んだ後、記録したどのキーにも平文トークンが含まれない。`commentStore` の `listThreadsByMap` などが `new Error("SQLITE_ERROR: secret-detail token=...")` を投げても、応答本文は `{ ok: false, reason: "storage-error" }` だけ（JSON をそのまま比較）。
  - 経路のレート制限: token 経路の view リミッタ超過（IP キー・トークンキーそれぞれ）と owner 経路の owner リミッタ超過で 429。
  - `threadId` / `commentId` が空文字のとき `not-found`（ハンドラを直接呼んで確かめる）。
  - 所有者がログインした状態で view リンクのトークン経路を使うと、一覧・作成・返信・解決・再開・削除がすべて 404。
  - 別マップ: マップ B のスレッド ID・コメント ID を、マップ A の owner 経路と token 経路の URL で操作すると 404、B の行は変わらない。
- [x] `handleShareApi.test.ts` の `deps()` に `getCommenter` を足す（必須化に合わせる）。
- [x] 実装: ハンドラ、`shareResponses.ts`、`shareRateLimit.ts`、`createShareApiDeps.ts`（`getCommenter: commenterFromAuth`、`commentWriteRateLimiter: processShareCommentWriteRateLimiter`）、Route Handler 一式。サービスは `deps.commentService ?? createShareCommentService({ store: deps.store ?? createCloudflareShareStore(deps.d1, deps.r2), commentStore: deps.commentStore ?? createCloudflareShareCommentStore(deps.d1), tokenSecret: deps.tokenSecret, getSession: deps.getSession, getCommenter: deps.getCommenter, nowIso: deps.nowIso, createId: deps.createId })`。
- [x] 検証: `cd client && npx tsc --noEmit && npx jest src/server/share`

**完了条件:** §6.2 の全セルと判定順がテストで固定され、Route Handler が全部ある（`find client/src/app/api/share -name route.ts | wc -l` が既存 7 ＋新規 10）。

---

### Task 4: API クライアント

**Files:**
- Modify: `client/src/services/share/shareApiClient.ts`、`client/src/domain/share/planShareViewLoad.ts`、`client/src/hooks/useMapEditorShare.ts`（`createLink` の呼び出しだけ）、`client/src/app/share/[token]/ShareViewerPage.tsx`（型の追随だけ）
- Create: `client/src/services/share/shareCommentsApiClient.ts`、`client/src/services/share/__tests__/shareCommentsApiClient.test.ts`
- Modify tests: `client/src/services/share/__tests__/shareApiClient.viewByToken.test.ts`、`client/src/domain/share/__tests__/planShareViewLoad.test.ts`（`planShareViewDocumentParse` の呼び出しも新シグネチャへ置換）、`client/src/hooks/__tests__/useMapEditorShare.test.tsx`（`createLink` と `viewByToken` のモックを新シグネチャ・新しい戻り値の型へ）、`client/src/app/share/[token]/__tests__/ShareViewerPage.test.tsx`（`viewByToken` の成功応答モックに `permission: "view"` を足す）

**Interfaces:** 受け取るもの: Task 3c の HTTP 契約、Task 1 の型。次へ渡すもの:

```ts
// shareApiClient.ts
export async function parseShareResult<T>(response: Response): Promise<ShareResult<T>>; // export のみ
export function resolveFetch(fetchImpl: typeof fetch | undefined): typeof fetch;          // export のみ
// ShareApiClient の変更
createLink: (sharedMapId: string, permission: ShareLinkPermission) => Promise<ShareResult<ShareLinkIssued>>; // 本文 { permission }
viewByToken: (token: string) => Promise<ShareResult<{ documentJson: string; permission: string }>>; // permission はサーバーの生値。planShareViewLoad で parse する

// planShareViewLoad.ts
export type ShareViewLoadPlan =
  | { status: "ready"; document: MapDocument; permission: ShareLinkPermission; loadError: null }
  | { status: "error"; document: null; loadError: string };
export function planShareViewLoad(result: ShareResult<{ documentJson: string; permission: string }>): ShareViewLoadPlan;
// 既存関数の引数に permission を追加（planShareViewLoad の成功経路から、parseShareLinkPermission 済みの値を渡す）
export function planShareViewDocumentParse(parsed: ShareViewDocumentParse, permission: ShareLinkPermission): ShareViewLoadPlan;
// permission が parseShareLinkPermission で null なら error（SHARE_MESSAGES.viewLoadFailed）

// shareCommentsApiClient.ts
export function shareCommentsBasePath(scope: ShareCommentsScope): string;
// token: `/api/share/view/${encodeURIComponent(token)}`、owner: `/api/share/maps/${encodeURIComponent(sharedMapId)}`
export type ShareCommentsApiClient = {
  list(scope: ShareCommentsScope): Promise<ShareResult<ShareCommentListValue>>;                         // GET {base}/comment-threads
  createThread(scope: ShareCommentsScope, input: { nodeId: number; body: string }): Promise<ShareResult<ShareCommentThreadView>>; // POST
  reply(scope: ShareCommentsScope, threadId: string, input: { body: string }): Promise<ShareResult<ShareCommentThreadView>>;
  resolve(scope: ShareCommentsScope, threadId: string): Promise<ShareResult<ShareCommentThreadView>>;
  reopen(scope: ShareCommentsScope, threadId: string): Promise<ShareResult<ShareCommentThreadView>>;
  deleteComment(scope: ShareCommentsScope, commentId: string): Promise<ShareResult<ShareCommentDeleteValue>>; // DELETE {base}/comments/:id
};
export function createShareCommentsApiClient(fetchImpl?: typeof fetch): ShareCommentsApiClient;
// fetch の例外は { ok:false, reason:"network-error" }。本文がある POST は Content-Type: application/json。
```

**Steps:**
- [x] テスト（RED）: URL 組み立て（2 scope、`/` や `?` を含む ID の `encodeURIComponent`）、メソッド・ヘッダー・本文、`network-error`・`invalid-response`。`createLink` の本文が `{ permission: "comment" }`。`viewByToken` と `planShareViewLoad` の `permission`（view / comment / 未知の値は error）。`planShareViewDocumentParse(parsed, permission)` が ready に `permission` を載せ、パース失敗は従来どおり error。
- [x] 実装。呼び出し元の置換: `useMapEditorShare` の `onCreateLink` は `resolveApi().createLink(sharedMapId, "view")`。`ShareViewerPage` は型の追随だけ（表示は変えない）。`planShareViewDocumentParse` の既存呼び出し（`rg -n "planShareViewDocumentParse" client/src`）を新シグネチャへ置換する。`ShareViewerPage.test.tsx` の `viewByToken` 成功応答モック（`documentJson` を返している箇所すべて）に `permission: "view"` を足し、既存の表示テストが通ることを確かめる。`useMapEditorShare.test.tsx` の API モックの `createLink` を `(sharedMapId, permission)` に、`viewByToken` を `{ documentJson, permission }` を返す形に直す。
- [x] 検証: `cd client && npx tsc --noEmit && npx jest src/services/share src/domain/share src/hooks/__tests__/useMapEditorShare.test.tsx src/app/share`

**完了条件:** クライアントの型が Task 3c の HTTP 契約と一致し、既存の閲覧ページのテストが通る。

---

### Task 5: 共有ダイアログ（comment リンク）

**Files:**
- Modify: `client/src/components/layout/ShareDialog.tsx`、`client/src/domain/share/shareDialogModel.ts`、`client/src/domain/share/shareMessages.ts`、`client/src/hooks/useMapEditorShare.ts`、`client/src/components/map/MapEditor.tsx`（`onCreateCommentLink` の配線だけ）
- Modify tests: `client/src/components/layout/__tests__/ShareDialog.test.tsx`、`client/src/domain/share/__tests__/shareDialogModel.test.ts`、`client/src/hooks/__tests__/useMapEditorShare.test.tsx`、`client/src/components/map/__tests__/MapEditorShare.test.tsx`

**Interfaces:** 受け取るもの: Task 4 の `ShareApiClient.createLink(sharedMapId, permission)`、Task 1 の `ShareLinkIssued.permission`。次へ渡すもの:

```ts
// shareDialogModel.ts
export type ShareDialogLinkRef = { readonly id: string; readonly createdAt: string; readonly revokedAt: string | null; readonly permission: string };
export function listActiveShareLinksForMap(...同じ引数): Array<{ id: string; createdAt: string; permission: ShareLinkPermission | null }>;
export function formatShareLinkPermissionLabel(permission: ShareLinkPermission | null): string; // 「閲覧」/「コメント可」/「不明」

// ShareDialogProps に追加（必須）
onCreateCommentLink: () => Promise<ShareResult<ShareLinkIssued>>;

// useMapEditorShare の戻り値に追加
onCreateCommentLink: () => Promise<ShareResult<ShareLinkIssued>>;

// SHARE_MESSAGES に追加
createCommentLink: "コメントリンクを追加",
createCommentLinkSuccess: "コメントリンクを発行しました。",
permissionView: "閲覧",
permissionComment: "コメント可",
permissionUnknown: "不明",
deleteShareCommentsWarning: "共有を解除すると、このマップのコメントもすべて削除されます。",
```

**Steps:**
- [x] テスト（RED）:
  - `ShareDialog`: 共有中に「コメントリンクを追加」があり、押すと `onCreateCommentLink`。有効条件は「閲覧リンクを追加」と同じ（busy・メタ読取失敗で無効、未共有では非表示）。リンク行と発行直後の URL 枠に権限ラベル。未知の permission は「不明」で、失効ボタンだけ押せる。「共有を解除」の直前に注意文。
  - `useMapEditorShare`: `onCreateCommentLink` が `createLink(sharedMapId, "comment")` を呼び、成功時に `lastIssuedLink` と成功文言。再発行の成功後、`shareList` の新リンクの `permission` が成功値の `permission`（モックで comment を返す）。
  - `MapEditorShare.test.tsx`: `ShareDialog` に `onCreateCommentLink` が配線されている（L-060）。
- [x] 実装。`onReissueLink` の `applyReissueToShareList` に渡す `permission` を `link.permission`（成功値）にする。
- [x] 検証: `cd client && npx tsc --noEmit && npx jest src/components/layout/__tests__/ShareDialog.test.tsx src/domain/share src/hooks/__tests__/useMapEditorShare.test.tsx src/components/map/__tests__/MapEditorShare.test.tsx`

**完了条件:** 所有者が comment リンクを発行・再発行でき、権限が画面に出る。

---

### Task 6: 件数バッジの描画

**Files:**
- Modify: `client/src/components/map/pixi/renderMapNodes.ts`、`client/src/components/map/pixi/renderMapScene.ts`、`client/src/components/map/useRenderedMapScene.ts`、`client/src/components/map/MapStage.tsx`、`client/src/components/map/MapEditor.tsx`（空 Map を渡すだけ）、`client/src/components/share/ShareMapView.tsx`（空 Map を渡すだけ）、`client/src/components/map/testing/AutoLayoutMapStageHarness.tsx`（`MapStage` を描くテスト用ハーネス。空 Map を渡す）
- Modify tests: `client/src/components/map/pixi/__tests__/renderMapNodes.test.ts`、`renderMapScene.test.ts`、`client/src/components/map/__tests__/MapStage*.test.tsx` など `renderMapNodes` / `renderMapScene` / `MapStage` の options・props を作るテスト（呼び出し元は `rg -n "<MapStage|useRenderedMapScene\(" client/src` と `rg -n "renderMapNodes\(|renderMapScene\(" client/src` で、テスト・ハーネスを含めて洗い出す）

**Interfaces:** 受け取るもの: なし（Task 1 の型も不要）。次へ渡すもの:

```ts
// RenderMapNodesOptions・RenderMapSceneOptions・MapStageProps に追加（必須。省略不可）
/** 未解決コメントスレッド数。0 のノードはキーを持たない。空 Map = 印なし */
commentNodeCounts: ReadonlyMap<number, number>;

// renderMapNodes.ts
export const COMMENT_BADGE_RADIUS = 7;
/** 印なしの共有定数。MapEditor と ShareMapView の両方がここから import する */
export const EMPTY_COMMENT_NODE_COUNTS: ReadonlyMap<number, number> = new Map();
export function formatCommentBadgeText(count: number): string; // 1–9 はそのまま、10 以上は "9+"
```

**Steps:**
- [x] `renderMapNodes.test.ts`（RED）: `commentNodeCounts` にあるノードだけ、コンテナに `Graphics`（円）と `Text`（件数）が 1 組足される。0 や負・キー無しは描かない。10 以上は「9+」。円の中心はノードの左下角（`node.x`, `node.y + node.height`）。左上=ピン・右上=リンク・右下=ロックの角印と重ならないため（リンク・ピン・ロック印と中心が一致せず円同士が交差しないことも確かめる）。`isVisible` が偽のノードには描かない。`taskProgress` バッジと同時に出ても両方ある。進捗バッジの矩形（`computeTaskProgressMapLabelLayout` の `badge` の中心と、描いた `Text` の `width` / `height` から求める外接矩形）とコメントバッジの円（中心と `COMMENT_BADGE_RADIUS`）が交差しないことを、幅・高さ・イラスト有無の異なる複数ノードで座標から確かめる。
- [x] 実装: 既存の進捗バッジの描画の後に、`constructors.Graphics` で `circle(cx, cy, COMMENT_BADGE_RADIUS)` を塗り（既存の強調色の定数がある場合はそれを使い、無ければ `0x2563eb`）、`constructors.Text`（`fontSize: 9`、白、`anchor.set(0.5)`）を同じ中心に置き、`alpha` は `contentAlpha`。
- [x] `renderMapScene`・`useRenderedMapScene`（分割代入と effect の依存配列）・`MapStage`（必須 prop を scene へ）に配線する。`MapEditor` は `MapStage` に `commentNodeCounts={EMPTY_COMMENT_NODE_COUNTS}`、`ShareMapView` と `AutoLayoutMapStageHarness` も同じ定数を渡す。定数は `renderMapNodes.ts` から import する（`ShareMapView` が `MapEditor` を import しないため。実データは Task 7b・8b）。
- [x] 既存テストの options / props に `commentNodeCounts: new Map()` を足す。
- [x] 検証: `cd client && npx tsc --noEmit && npx jest src/components/map src/components/share`

**完了条件:** バッジの描画が単体で固定され、全呼び出し元が必須 prop を明示的に渡している。

---

### Task 7a: コメントの共用部品

**Files:**
- Create: `client/src/components/share/ShareCommentThreadList.tsx`、`client/src/components/share/ShareCommentComposer.tsx`
- Create tests: `client/src/components/share/__tests__/ShareCommentThreadList.test.tsx`、`client/src/components/share/__tests__/ShareCommentComposer.test.tsx`

**Interfaces:** 受け取るもの: Task 1 の `ShareCommentThreadView`・`ShareCommentDeleteValue`・`normalizeShareCommentBody`・`SHARE_COMMENT_MESSAGES`・`SHARE_COMMENT_BODY_MAX_LENGTH`、既存 `preventRepeatedActivationClick`（`client/src/components/layout/repeatedEnterClick.ts`）。次へ渡すもの:

```ts
// ShareCommentComposer.tsx（制御コンポーネント）
export type ShareCommentComposerProps = {
  value: string;
  onChange: (value: string) => void;
  /** 成功したら呼び出し元が value を空にする */
  onSubmit: (body: string) => Promise<ShareResult<unknown>>;
  submitLabel: string;
  disabled: boolean;          // busy・ログイン前など
  ariaLabel: string;
};
export function ShareCommentComposer(props: ShareCommentComposerProps); // 戻り値の型注記は付けない（既存コンポーネントの慣行）

// ShareCommentThreadList.tsx
export type ShareCommentThreadSections = {
  readonly open: readonly ShareCommentThreadView[];
  readonly resolved: readonly ShareCommentThreadView[];
  readonly orphaned: readonly ShareCommentThreadView[];
};
export type ShareCommentThreadListProps = {
  sections: ShareCommentThreadSections;
  /** 見出しに出すラベル。無いノード（orphaned）は nodeLabelSnapshot を「削除されたノード: 」付きで出す */
  nodeLabelById: ReadonlyMap<number, string>;
  canPost: boolean;
  busy: boolean;
  /** フォーカスの最後の戻り先（一覧の見出し「コメント」） */
  listHeadingRef: RefObject<HTMLElement | null>;
  onSelectThreadNode: ((nodeId: number) => void) | null; // 閲覧シェルの選択強調用。所有者は null
  onReply: (threadId: string, body: string) => Promise<ShareResult<ShareCommentThreadView>>;
  onResolve: (threadId: string) => Promise<ShareResult<ShareCommentThreadView>>;
  onReopen: (threadId: string) => Promise<ShareResult<ShareCommentThreadView>>;
  onDeleteComment: (threadId: string, commentId: string) => Promise<ShareResult<ShareCommentDeleteValue>>;
};
export function ShareCommentThreadList(props: ShareCommentThreadListProps); // 戻り値の型注記は付けない（既存コンポーネントの慣行）
```

**挙動（設計 §7.4）:**
- Composer: `textarea`（`maxLength` を付けない）と送信ボタン。残り文字数は `SHARE_COMMENT_BODY_MAX_LENGTH - normalized.length`（`too-long` / `empty` の間は送信ボタン無効）。Ctrl+Enter / Cmd+Enter で送信、Enter 単独は改行。キー処理の先頭で `event.nativeEvent.isComposing || event.keyCode === 229` なら何もしない。`submittingRef`（`useRef(false)`）で同期ガードし、`finally` で解除。送信中はボタン `disabled`。
- ThreadList:
  - 各スレッドは見出し（`tabIndex={-1}`、`data-thread-id`）にノードラベル（attached は `nodeLabelById` の現ラベル。`nodeLabelSnapshot` と異なれば「コメント時: <snapshot>」を併記。orphaned は「削除されたノード: <snapshot>」のみ）、状態、解決者・解決日時（`Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" })`）。本文は `whitespace-pre-wrap break-words` のテキスト。
  - 「解決済み」節は `<details>` で折りたたみ、「削除されたノード」節は見出し付き。
  - 返信欄は open のスレッドで `canPost` のときだけ。下書きは `useState<ReadonlyMap<string, string>>` でスレッド ID キーに持つ。`sections` が変わったら、どの節にも無いスレッド ID の下書きだけ捨てる。送信成功でそのキーを空にする。
  - 解決 / 再開ボタンは `thread.canResolve` のとき、削除ボタンは `comment.canDelete` のとき。
  - 削除: ボタンでそのコメント直下にインライン確認（文言・「削除する」・「キャンセル」）を出し、フォーカスを「キャンセル」へ移す。両ボタンに `onKeyDown={preventRepeatedActivationClick}`。「削除する」で `onDeleteComment`。
  - 操作後のフォーカス: 削除成功でスレッドが残れば同じスレッドの見出し。消えたら次 → 前のスレッドの見出し → `listHeadingRef`。解決成功は元の位置の次のスレッドの見出し（無ければ `listHeadingRef`）。再開成功はそのスレッドの見出し。フォーカス移動は更新後の描画の後（`useLayoutEffect` で保留中の要求を処理）。
  - `onSelectThreadNode` が非 null なら、attached のスレッド見出しの横に「このノードを選択」ボタン。

**Steps:**
- [x] Composer テスト（RED）: 残り文字数の表示（入力に応じて減る、正規化後の長さで数える）、空白だけ（`empty`）で送信ボタン無効、IME（`isComposing` true・`keyCode` 229 をそれぞれ単独で）で送らない、Ctrl+Enter と Cmd+Enter で送る、Enter 単独は送らない、連打・Ctrl+Enter の連続で `onSubmit` が 1 回、失敗で入力が残る（`onChange("")` が呼ばれない）、2,001 文字で送信ボタン無効、`maxLength` 属性が無い。
- [x] ThreadList テスト（RED）: 見出しのラベル（attached で現ラベルと `nodeLabelSnapshot` が同じなら現ラベルだけ、異なるなら現ラベルと「コメント時: <snapshot>」を併記、orphaned は「削除されたノード: <snapshot>」だけ）、削除確認の表示中はフォーカスが「キャンセル」にある、`<img src=x onerror=alert(1)>` と `<b>` を含む本文・表示名が文字列のまま出て `img` 要素が 0 件、能力によるボタンの出し分け、削除は確認を経てだけ `onDeleteComment`、削除ボタンで Enter を押したまま（`repeat: true` の keydown）でも確定しない、`sections` を差し替えても他スレッドの返信下書きが残り消えたスレッドの下書きは捨てられる、操作後のフォーカス（4 パターン）。
- [x] 実装して GREEN。
- [x] 検証: `cd client && npx tsc --noEmit && npx jest src/components/share/__tests__/ShareCommentThreadList.test.tsx src/components/share/__tests__/ShareCommentComposer.test.tsx`

**完了条件:** 両シェルで使う部品の安全性（XSS・IME・二重送信・削除確認・下書き・フォーカス）が単体で固定されている。

---

### Task 7b: 閲覧シェルの組み立て

**Files:**
- Create: `client/src/hooks/useShareCommenterSession.ts`、`client/src/app/share/[token]/useShareViewerComments.ts`、`client/src/components/share/ShareCommentsPanel.tsx`
- Modify: `client/src/app/share/[token]/ShareViewerPage.tsx`、`client/src/components/share/ShareViewer.tsx`、`client/src/components/share/ShareMapView.tsx`、`client/src/components/share/ShareOutlineView.tsx`
- Create / Modify tests: `client/src/hooks/__tests__/useShareCommenterSession.test.tsx`、`client/src/app/share/[token]/__tests__/useShareViewerComments.test.tsx`、`client/src/components/share/__tests__/ShareCommentsPanel.test.tsx`、`client/src/components/share/__tests__/ShareViewer.test.tsx`、`client/src/app/share/[token]/__tests__/ShareViewerPage.test.tsx`（既存の `REQUIRED_SHARE_VIEWER_PROP_KEYS`・`FORBIDDEN_IMPORT_PATTERNS` に追記）

**Interfaces:** 受け取るもの: Task 7a の部品、Task 6 の `commentNodeCounts`、Task 4 の `createShareCommentsApiClient`・`planShareViewLoad`（`ready.permission`）、Task 1 の `classifyShareCommentThreads`・`countOpenThreadsByNode`・`replaceThreadInList`・`removeCommentFromList`・`shareCommentOperationFailureMessage`、既存 `shareNotice.ts`。次へ渡すもの（Task 8a が同じ規則を使う）:

```ts
// useShareCommenterSession.ts
export type ShareCommenterSessionState = { status: "loading" | "ready"; commenter: ShareCommenter | null };
export function useShareCommenterSession(): ShareCommenterSessionState;

// shareCommentTarget.ts（型専用。ShareViewer / ShareMapView / ShareOutlineView の循環 import を避ける）
export type ShareCommentTarget = {
  readonly counts: ReadonlyMap<number, number>;
  readonly selectedNodeId: number | null;
  readonly onSelectNode: (nodeId: number) => void;
};

// ShareViewer.tsx
export type ShareViewerProps = { /* 既存 */ commentsPanel: ReactNode | null; commentTarget: ShareCommentTarget | null };
// ShareMapView / ShareOutlineView の props に commentTarget: ShareCommentTarget | null（必須）

// ShareMapView.tsx
export const SHARE_VIEWER_NODE_TAP_SLOP_PX = 4;

// useShareViewerComments.ts
// ShareCommentsListState は Task 1 の client/src/domain/share/shareComment.ts から import する
export function useShareViewerComments(options: {
  token: string;
  enabled: boolean;                       // permission === "comment"
  commenterUserId: string | null;
  sessionStatus: "loading" | "ready";
  api?: ShareCommentsApiClient;
}): {
  listState: ShareCommentsListState;
  value: ShareCommentListValue | null;    // ready のときだけ非 null
  reload: () => Promise<void>;
  createThread: (nodeId: number, body: string) => Promise<ShareResult<ShareCommentThreadView>>;
  reply: (threadId: string, body: string) => Promise<ShareResult<ShareCommentThreadView>>;
  resolve: (threadId: string) => Promise<ShareResult<ShareCommentThreadView>>;
  reopen: (threadId: string) => Promise<ShareResult<ShareCommentThreadView>>;
  deleteComment: (threadId: string, commentId: string) => Promise<ShareResult<ShareCommentDeleteValue>>;
  notice: OperationNotice | null;
  noticeSequence: number;
  busy: boolean;
};
```

**世代と要求番号（設計 §7.6・L-037 / L-040 / L-883）:** `generationRef` は `(token, commenterUserId)` が変わるたびに進め、一覧を idle・空に戻す。`listRequestSeqRef` は一覧取得の開始ごとと、書込み成功で一覧を差し替えるたびに進める。一覧応答は「開始時の世代と要求番号がどちらも現在と同じ」ときだけ適用する。書込みの応答も開始時の世代が現在と同じときだけ適用する。通知は `ShareNoticeState`: API を呼ぶ直前にクリア、送信前検証で止めた経路では消さない、成功文言は `SHARE_COMMENT_MESSAGES` の `*Success`。

**Steps:**
- [x] `useShareCommenterSession` テスト（RED）: `useSession` の loading → loading、未ログイン → ready/null、ログイン → ready/commenter（name 無しでも可）。
- [x] `useShareViewerComments` テスト（RED）: enabled false では API を呼ばない、loading → ready / error、**再読み込み中に書込みが成功し、後から届いた古い一覧が捨てられる**、**並行した 2 回の取得で古い方が後から届いても新しい方が残る**、`commenterUserId` が変わると一覧が空に戻り古い応答を捨てる、書込み成功で該当スレッドだけ差し替え、失敗は notice の error。通知（L-166 / L-931）: API を呼ぶ直前に前の通知を消す、送信前の検証（空本文・二重送信の拒否）で止めた経路では前の通知を消さない、`token` / `commenterUserId` の変更でクリア。
- [x] `ShareCommentsPanel` テスト（RED）: 選択ノードのラベル表示と、未選択時の案内文「ノードを選ぶとコメントを書けます」、新規スレッドの下書き（ノード A で書きかけ → ノード B を選ぶ → A に戻ると残る、一覧の差し替えで消えない、送信成功で空）、loading・ready 0 件・error（0 件案内を出さない）、セッション loading 中は投稿系とログイン導線が無い、未ログインはログイン導線で `signIn("google", { redirectTo: <現在のパス> })`、ログイン済みで選択ノードがあると新規スレッドの投稿欄、注意文が投稿欄の上にある、削除されたノード節、操作後のフォーカス（削除・解決・再開）。
- [x] `ShareViewer` / `ShareViewerPage` テスト（RED）:
  - view リンク: コメント関連の要素（`data-testid="share-comments-panel"`・件数・「コメント」ボタン）が 0 件で、コメント API の `fetch` が呼ばれない。
  - comment リンク: パネルが出る、アウトライン行の件数と「コメント」ボタンで選択、マップでしきい値以下の pointerup で選択・超えたら選択しない・`pointercancel` で捨てる、折りたたみで隠れたノードのスレッドを押しても展開しない。
- [x] 既存 `client/src/components/share/__tests__/ShareViewer.test.tsx` の境界テストに追記する（RED→GREEN）: `FORBIDDEN_IMPORT_PATTERNS` に `"@/components/layout/MapCommentsDialog"`・`"@/components/layout/CommentsControl"`・`"@/components/layout/NodeCommentsSection"`・`"@/hooks/useMapEditorComments"` を足し、`REQUIRED_SHARE_VIEWER_PROP_KEYS` に `"commentsPanel"`・`"commentTarget"` を足す（`satisfies ReadonlyArray<keyof ShareViewerProps>` で必須 props をコンパイル時に固定）。新しい境界テストのファイルは作らない。
- [x] 実装:
  - `ShareCommentsPanel`: 新規スレッドの下書きを `useState<ReadonlyMap<number, string>>`（nodeId キー）で持ち、選択ノードの値を `ShareCommentComposer` に渡す。一覧の差し替えでは消さず、送信成功でそのノードのキーを空にする。
  - `ShareViewerPage`: `ready.permission === "comment"` のときだけ `useShareViewerComments({ enabled: true, ... })` の結果で `ShareCommentsPanel` を作り、`commentTarget` に `counts = countOpenThreadsByNode(classifyShareCommentThreads(threads, 文書のノード ID 集合).attached)` と選択 state を渡す。view のときは両方 `null`（hook は `enabled: false`）。
  - `ShareViewer`: `commentsPanel` 非 null のとき `md` 以上で右に幅 360px の列、狭い画面ではマップの下。
  - `ShareMapView`: `commentTarget` 非 null のとき、`createNodePointerDownHandler` は候補ノード ID を ref に控えるだけにし、既存のキャンバスの DOM `pointerdown` で押下位置を控え、`pointerup` で移動量（`Math.hypot`）が `SHARE_VIEWER_NODE_TAP_SLOP_PX` 以下かつ候補があれば `onSelectNode`、どちらでも候補を捨てる。`pointercancel` でも捨てる。`selectedNodeIds` は `selectedNodeId === null ? [] : [selectedNodeId]`、`commentNodeCounts` は `counts`。null のときは現状どおり。
  - `ShareOutlineView`: `commentTarget` 非 null のとき行の右に件数（「コメント n」、未解決 1 以上）と「コメント」ボタン。
- [x] 検証: `cd client && npx tsc --noEmit && npx jest src/components/share src/app/share src/hooks/__tests__/useShareCommenterSession.test.tsx`

**完了条件:** comment リンクで読む・投稿・解決・削除ができ、view リンクではコメント UI が 0 件。

---

### Task 8a: 所有者側の hook とダイアログ

**Files:**
- Create: `client/src/hooks/useMapEditorComments.ts`、`client/src/components/layout/MapCommentsDialog.tsx`
- Create tests: `client/src/hooks/__tests__/useMapEditorComments.test.tsx`、`client/src/components/layout/__tests__/MapCommentsDialog.test.tsx`

**Interfaces:** 受け取るもの: Task 7a の部品、Task 7b の世代・要求番号の規則、Task 1 の `ShareCommentsListState`（`client/src/domain/share/shareComment.ts`）、Task 4 の `createShareCommentsApiClient`、Task 1 のドメイン、既存 `useDialogFocusTrap`・`listFocusableElements`（`client/src/components/layout/useDialogFocusTrap.ts`）・`handleDialogClickCapture`（`dialogClickCapture.ts`）・`useReannouncedNotice`。次へ渡すもの:

```ts
// useMapEditorComments.ts
export type UseMapEditorCommentsOptions = {
  mapId: string;
  sharedMapId: string | null;
  shareSession: ShareSession;
  shareSessionStatus: "loading" | "ready";
  dialogOpen: boolean;
  nodeIds: ReadonlySet<number>;
  api?: ShareCommentsApiClient;
};
export type MapEditorComments = {
  listState: ShareCommentsListState;
  value: ShareCommentListValue | null;
  classified: ClassifiedShareCommentThreads | null;     // ready のときだけ
  openCountByNode: ReadonlyMap<number, number>;          // ready 以外は空 Map
  summaryForNode: (nodeId: number) => { open: number; resolved: number } | null; // ready 以外は null。ready なら 0 件でも { open: 0, resolved: 0 }
  reload: () => Promise<void>;
  createThread: (nodeId: number, body: string) => Promise<ShareResult<ShareCommentThreadView>>;
  reply: (threadId: string, body: string) => Promise<ShareResult<ShareCommentThreadView>>;
  resolve: (threadId: string) => Promise<ShareResult<ShareCommentThreadView>>;
  reopen: (threadId: string) => Promise<ShareResult<ShareCommentThreadView>>;
  deleteComment: (threadId: string, commentId: string) => Promise<ShareResult<ShareCommentDeleteValue>>;
  notice: OperationNotice | null;
  noticeSequence: number;
  busy: boolean;
  clearNotice: () => void;
};
export function useMapEditorComments(options: UseMapEditorCommentsOptions): MapEditorComments;

// MapCommentsDialog.tsx
export type MapCommentsDialogProps = {
  comments: MapEditorComments;
  nodeLabelById: ReadonlyMap<number, string>;
  selectedNodeId: number | null;
  initialFilter: "selected" | "all";
  shareSession: ShareSession;
  shareSessionStatus: "loading" | "ready";
  onLogin: () => void;
  onClose: () => void;
  dialogMouseClickedAtRef: RefObject<number | null>;
};
export function MapCommentsDialog(props: MapCommentsDialogProps); // 戻り値の型注記は付けない（既存コンポーネントの慣行）
```

**挙動:** scope は `{ kind: "owner", sharedMapId }`。`sharedMapId` が null または未ログインなら `idle`。取得の契機は `(mapId, sharedMapId, userId)` が揃ったとき 1 回、`dialogOpen` が false→true、`reload`。世代と要求番号は Task 7b と同じ規則。ログアウトで空。通知はダイアログを閉じる・`mapId` / `sharedMapId` / userId の変更でクリア。ダイアログは `ShareDialog` と同じ部品構成（`role="dialog"`・`aria-modal`・フォーカストラップ・Escape で閉じる・`data-testid="map-comments-dialog"`）。絞り込み「選択中のノード / すべて」、「再読み込み」、3 節、選択中のノードがあり絞り込みが selected のときだけ新規スレッドの `ShareCommentComposer`（下書きは nodeId キーの `ReadonlyMap<number, string>` をダイアログが持ち、一覧の差し替えで消さず送信成功で空にする）、投稿欄の上に `nameVisibilityNotice`、`invalid-node` の失敗は `shareCommentOperationFailureMessage("invalid-node")` を notice に。ノードへ移動のボタンは置かない（`onSelectThreadNode={null}`）。

**Steps:**
- [x] `useMapEditorComments` テスト（RED）: idle 条件、取得の契機、再読み込み中に書込み成功→古い一覧を捨てる、並行取得の順序、`mapId` 切替中に届いた古い応答を捨てる、ログアウトで空・バッジ空、error でバッジ空・前回の一覧を残さない、書込み応答で差し替え、`summaryForNode`（ready・0 件で `{ open: 0, resolved: 0 }`、ready 以外で null）。通知（L-166 / L-931）: API を呼ぶ直前に前の通知を消す、送信前の検証で止めた経路では消さない、`mapId` / `sharedMapId` / userId の変更でクリア。
- [x] `MapCommentsDialog` テスト（RED）: 状態別表示（棚卸し §2.4 の C3-L/R/E/S）、ログイン導線、注意文、絞り込み、`invalid-node` の文言、「ノードへ移動」系のボタンが無い、操作後のフォーカス（削除・解決・再開）、通知の再読み上げ（同一文言で `noticeSequence` が進む）、Escape で `onClose`、閉じると通知がクリアされる（`clearNotice` が呼ばれる）。新規スレッドの下書き（ノード切替で戻ると残る、一覧の差し替えで消えない、送信成功で空）。
- [x] 実装して GREEN。`MapEditor` からはまだ使わない。
- [x] 検証: `cd client && npx tsc --noEmit && npx jest src/hooks/__tests__/useMapEditorComments.test.tsx src/components/layout/__tests__/MapCommentsDialog.test.tsx`

**完了条件:** 所有者側の取得・世代・ダイアログ表示が単体で固定されている。

---

### Task 8b: 編集シェルの配線

**Files:**
- Create: `client/src/components/layout/CommentsControl.tsx`、`client/src/components/layout/NodeCommentsSection.tsx`、`client/src/components/map/__tests__/MapEditorComments.test.tsx`
- Modify: `client/src/domain/map/mapEditorModalBlocking.ts`、`client/src/components/map/MapEditor.tsx`、`client/src/components/layout/NodeDetailPanel.tsx`
- Modify tests: `client/src/domain/map/__tests__/mapEditorModalBlocking.test.ts`、`client/src/components/layout/__tests__/NodeDetailPanel.test.tsx`、`NodeDetailPanel` を描く他のテスト（`rg -n "<NodeDetailPanel" client/src --glob "*test*"`）

**Interfaces:** 受け取るもの: Task 8a の `useMapEditorComments`・`MapCommentsDialog`、Task 6 の `MapStage.commentNodeCounts`、Task 1 の `resolveCommentsOpenBlocked`・`commentsOpenBlockedMessage`、既存 `ShareControl` の形、`share.localMeta`（`useMapEditorShare` の戻り値）。次へ渡すもの: なし（最後の実装 Task）。

```ts
// mapEditorModalBlocking.ts
export type MapEditorModalBlockingInput = { /* 既存 */ readonly commentsDialogOpen: boolean };

// CommentsControl.tsx（ShareControl と同じ形）
export function CommentsControl(props: { expanded: boolean; disabled?: boolean; disabledReason?: string; onOpen: () => void; buttonRef?: Ref<HTMLButtonElement> }); // 戻り値の型注記は付けない

// NodeDetailPanel の props に追加（必須）
commentSummary: { open: number; resolved: number } | null;
onOpenNodeComments: (() => void) | null;
openNodeCommentsDisabledReason: string | null;

// NodeCommentsSection.tsx
export function NodeCommentsSection(props: { summary: { open: number; resolved: number }; onOpen: () => void; disabledReason: string | null }); // 戻り値の型注記は付けない
```

**配線（MapEditor）:**
- `commentsDialog` の state（`{ open: boolean; initialFilter: "selected" | "all" }`）を `MapEditor` 内に持つ。`mapId` 変更で閉じる（`useLayoutEffect`、共有ダイアログと同じ）。
- `useMapEditorComments({ mapId, sharedMapId: share.localMeta.status === "present" ? share.localMeta.value.sharedMapId : null, shareSession, shareSessionStatus, dialogOpen: commentsDialog.open, nodeIds })`。`nodeIds` は `nodes` から `useMemo`。
- ガード: `commentsBlocked = resolveCommentsOpenBlocked({ learningActive, playingPresentation })`。未共有なら `CommentsControl` は無効（理由 `SHARE_COMMENT_MESSAGES.notSharedDisabled`）、学習・再生中は `commentsOpenBlockedMessage`。競合・保護では有効。開く関数 `openComments(filter)` は 1 本にし、ヘッダーからは `openComments("all")`、右パネルからは `openComments("selected")` で呼ぶ。未共有の判定はログイン状態より先に行う（未ログインでも未共有なら未共有の理由で無効。共有中なら未ログインでも有効で、ダイアログ内がログイン導線）。
- `resolveMapEditorModalsBlockEditing` に `commentsDialogOpen: commentsDialog.open` を渡す（編集ショートカット停止と listening 即停止が既存の束で効く）。
- `CommentsControl` はヘッダーの `ShareControl` の直後。閉じたらボタンへフォーカスを戻す（無効ならエクスポートボタン。共有と同じ）。
- `MapStage` に `commentNodeCounts={comments.openCountByNode}`（Task 6 の空 Map 定数を置き換える）。
- `NodeDetailPanel` に `commentSummary={selectedNodeId === null ? null : comments.summaryForNode(selectedNodeId)}`、`onOpenNodeComments={sharedMapId === null ? null : () => openComments("selected")}`、`openNodeCommentsDisabledReason`（学習・再生中の文言、それ以外 null）。
- `MapCommentsDialog` は `ShareDialog` と同じく根の兄弟（`inert` の外）に置き、`onLogin={onShareLogin}`・`dialogMouseClickedAtRef` を渡す。

**Steps:**
- [x] テスト（RED）:
  - `mapEditorModalBlocking.test.ts`: `commentsDialogOpen` だけ真で true。
  - `NodeDetailPanel.test.tsx`: `commentSummary` 非 null で節が出る（`{ open: 0, resolved: 0 }` でも節と「コメントを開く」が出る）、null で出ない、`openNodeCommentsDisabledReason` で `disabled` と `title`。
  - `MapEditorComments.test.tsx`（結合・L-060）: 未共有で「コメント」無効と理由、未ログイン＋未共有で未共有の理由が優先されて無効、未ログイン＋共有中で有効かつダイアログ内にログイン導線、共有中で有効、ヘッダーから開くと絞り込み「すべて」・右パネルから開くと「選択中のノード」、ready・0 件で右パネルの節と「コメントを開く」が出る、学習・再生中は無効（右パネルも理由付き無効）、競合・保護で開ける、listening 中に開くと音声が止まる、ダイアログ表示中に編集ショートカット（例: Tab で子追加）が効かない、一覧 ready でバッジの Map が `MapStage` に渡る・error で空、`mapId` 切替でダイアログが閉じる、閉じたらフォーカスが「コメント」ボタンへ戻る。API は `createShareCommentsApiClient` に渡す `fetch` のモックで差し替える（`useMapEditorComments` の `api` を `MapEditor` から注入できないなら `jest.mock("@/services/share/shareCommentsApiClient")`）。
- [x] 実装して GREEN。
- [x] 検証: `cd client && npx tsc --noEmit && npx jest src/components/map src/components/layout src/domain/map`

**完了条件:** 所有者の編集画面で、バッジ・右パネル・ダイアログからコメントを読み、投稿・解決・削除できる。

---

### Task 9: ドキュメントと ROADMAP

**Files:**
- Modify: `docs/setup/share-setup.md`、`docs/specifications/features.md`、`docs/specifications/api.md`、`docs/testing/browser-test-cases.md`、`ROADMAP.md`、`docs/superpowers/specs/2026-11-27-phase38-comments-inventory.md`（チェック欄）

**Interfaces:** 受け取るもの: Task 1〜8b の実装（実際のファイル名・文言・API を docs に写す）。次へ渡すもの: なし。

**Steps:**
- [x] `share-setup.md`:
  - §4 に「Phase 38: コメント用テーブルの追加」節。設計 §5.2 の DDL をそのまま載せ、D1 コンソールで実行すること、実行前にデータベース名を確かめること、既存テーブルは触らないことを書く。
  - 同じ節に「既存の `share_links` の定義を確かめる」手順:
    1. 作業前に D1 のデータをエクスポートして退避する。
    2. `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'share_links';` を実行し、表示された `CREATE TABLE` 文を控える。`permission` に `'comment'` を拒む CHECK（例: `CHECK (permission = 'view')`）が無ければここで終わり。
    3. `SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'share_links' AND sql IS NOT NULL;` を実行し、インデックスの `CREATE INDEX` 文を控える。
    4. 手順 2 で控えた文をコピーし、テーブル名を `share_links_new` に、CHECK だけを `CHECK (permission IN ('view', 'comment'))` に直して実行する（他の列・制約は変えない）。
    5. `INSERT INTO share_links_new SELECT * FROM share_links;` を実行し、`SELECT COUNT(*) FROM share_links;` と `SELECT COUNT(*) FROM share_links_new;` が一致することを確かめる。一致しなければ `DROP TABLE share_links_new;` で戻して中止する。
    6. `DROP TABLE share_links;` → `ALTER TABLE share_links_new RENAME TO share_links;`。
    7. 手順 3 で控えた `CREATE INDEX` 文をそのまま実行してインデックスを作り直す。
    8. 手順 2 の SELECT をもう一度実行し、CHECK が直っていることを確かめる。
  - §1 概要と §6 動作確認に comment リンクの手順、§7 対象外から「comment 権限・コメント UI」を外し、098 通知・メンションなど Phase 38 の見送りを書く。
- [x] `features.md`: 「40. ノードコメントと解決管理（Phase 38）」を追加（権限表・UI の入口・上限・削除されたノード・非目標）。
- [x] `api.md`: コメント API の節（設計 §8.1・§8.2・§8.3・§8.4 の表、reason と HTTP、ヘッダー）と、既存 API の変更（links の permission、reissue の引継ぎ、view 応答の permission、共有解除のコメント削除）。
- [x] `browser-test-cases.md`: 「AQ. ノードコメントと解決管理（Phase 38・候補096・097）」を追加。ケース: comment リンクを別プロファイルで開き Google ログインして投稿・解決、view リンクでコメントが見えない、所有者の編集画面でバッジ・右パネル・ダイアログに出る、解決・再開、ノードを消して「共有を更新」した後に「削除されたノード」に残り解決・削除できる、comment リンクの再発行後も comment のまま、共有解除でコメントが消える、上限到達で 409 の文言（テスト用 D1 で上限件数まで入れて確かめる）、Phase 38 の DDL を実行していない D1 で共有解除が成功する（L-059）。各ケースに【高】【中】の優先度を既存の AP 節と同じ書式で付ける。
- [x] `ROADMAP.md`: Phase 38 の 096・097 を `[x]`、098 は `[ ]` のまま。Phase 38 の見出しを「（進行中）」にする。「現在地」の Phase 38 の記述を「096・097 完了、次の未完了は候補098『変更通知・メンション』」に更新。「最終更新」を実装完了日にする。
- [x] 棚卸しのチェック欄を更新する。
- [x] 検証: `cd client && npm run verify`（tailwind:scan・lint・typecheck・全テスト・build）が成功すること。

**完了条件:** docs と ROADMAP が実装と一致し、`npm run verify` が成功する。

---

## 完了条件

- [x] `cd client && npm run verify` 成功
- [x] 設計 §6.2 の権限表・§6.3 の判定順・§10.1 の必須 props がテストで固定されている
- [x] view リンクでコメント UI が 0 件、閲覧シェルが所有者 UI を import していない
- [x] `sub`・メールがどの応答にも含まれない
- [x] ROADMAP の Phase 38 が 096・097 完了、098 未完了、見出し「進行中」
