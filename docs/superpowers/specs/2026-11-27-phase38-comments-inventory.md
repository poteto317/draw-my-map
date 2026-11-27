# Phase 38（096/097）: ノードコメントと解決管理 棚卸し（既存共有実装・入口）

作成日: 2026-11-27。設計: `docs/superpowers/specs/2026-11-27-phase38-comments-design.md`。  
前提: Phase 37 の設計 `2026-11-26-phase37-share-view-link-design.md` と inventory `2026-11-26-phase37-share-view-link-inventory.md`（判定語・横断列の読み方は Phase 37 inventory の定義をそのまま使う）。

本ファイルは 2 部構成にする。

- **第 1 部**: 既存の共有実装のうち、今回 **変更する**・**参照する（変更しない）** ファイルと関数の一覧。新規ファイルの予定も載せる。
- **第 2 部**: コメント機能の操作入口インベントリ（L-061）。設計 §9 の正本。

- [x] 第 1 部（既存ファイル・関数の棚卸し）
- [x] 第 2 部（入口インベントリ）
- [x] Task 9: 実装との突き合わせ（末尾「Task 9 で反映した実装との差分」）

---

## 第 1 部 既存の共有実装の棚卸し

凡例: **変更** = 今回コードを書き換える / **参照** = 呼ぶ・形を合わせるが書き換えない / **新規** = 作るファイル（予定）。

### 1.1 サーバー（`client/src/server/share/`）

| ファイル | 関数・型 | 区分 | 今回の扱い |
|---|---|---|---|
| `shareStore.ts` | `ShareStore`、`ShareLinkRecord`、`SharedMapRecord`、`ShareRevisionRecord`、`createCloudflareShareStore` | 参照 | コメント用の永続化は別型 `ShareCommentStore`（新規 `shareCommentStore.ts`）に分ける。`ShareStore` 自体は変更しない。`ShareLinkRecord.permission` は既に `string` なので型変更は不要 |
| `shareService.ts` | `createShareService`、`ShareServiceDeps`、`requireOwnedMap`、`requireOwnedLink`、`createLink`、`reissueLink`、`deleteShare`、`viewByToken` | 変更 | (1) `createLink` が `permission: "comment"` を受け付ける。(2) `reissueLink` が旧リンクの `permission` を引き継ぐ（現状は `planShareLinkCreate` が常に `"view"` を書く）。(3) `deleteShare` がコメントとスレッドも消す（`ShareServiceDeps` に必須の `commentStore` を足す）。(4) `viewByToken` の戻り値に `permission` を足す。(5) トークン解決と現行 revision 文書の読込を共通関数へ切り出す（下の新規 2 ファイル）。(6) `requireOwnedMap` を export し、`shareCommentService.ts` の所有者経路から使う |
| `handleShareApi.ts` | `ShareApiDeps`、`resolveService`、`readJsonBody`、`asRecord`、`withOwnerRateLimit`、`clientIpFromRequest`、`withViewResponseHeaders`、`handleCreateShareLink`、`handleViewShare` | 変更 | `ShareApiDeps` に `getCommenter`・`commentStore?`・`commentWriteRateLimiter?` を足す。`resolveService` が `commentStore` を渡す。`readJsonBody`・`asRecord`・`withViewResponseHeaders` はコメント API から再利用するため export する（`clientIpFromRequest` は既に export 済みなのでそのまま使う）。`handleCreateShareLink` は `permission` を文字列のまま service へ渡す現状を維持 |
| `shareResponses.ts` | `STATUS_BY_REASON`、`shareResultResponse`、`SHARE_VIEW_CACHE_CONTROL`、`SHARE_VIEW_REFERRER_POLICY` | 変更 | reason を追加: `invalid-comment`（400）、`invalid-node`（400）、`thread-resolved`（409）、`comment-limit`（409） |
| `shareBody.ts` | `readShareBodyWithinLimit`、`parseShareJson`、`SHARE_MAX_BODY_BYTES` | 参照 | コメント API は `readShareBodyWithinLimit(request, SHARE_COMMENT_MAX_BODY_BYTES)` で同じ関数を使う |
| `shareRateLimit.ts` | `createShareRateLimiter`、`ShareRateLimiter`、`processShareOwnerRateLimiter`、`processShareViewRateLimiter`、`SHARE_OWNER_RATE_LIMIT`、`SHARE_VIEW_RATE_LIMIT` | 変更 | `SHARE_COMMENT_WRITE_RATE_LIMIT` と `processShareCommentWriteRateLimiter` を追加する |
| `createShareApiDeps.ts` | `sessionFromAuth`、`createShareApiDepsFromEnv`、`notConfiguredResponse` | 変更 | `commenterFromAuth`（`auth()` → `toShareCommenter`）を追加し、`getCommenter` と `commentWriteRateLimiter` を本番 deps に入れる |
| `shareConfig.ts` | `readShareEnvConfig`、`createShareClientsFromConfig`、`resolveSharePublicOrigin` | 参照 | 環境変数の追加なし |
| `testing/memoryShareStore.ts` | `createMemoryShareStore`、`unusedClients` | 参照 | 新規 `testing/memoryShareCommentStore.ts` を並べる |
| `__tests__/handleShareApi.test.ts` | `deps`、`jsonRequest`、`createShare`、`validDocumentJson` | 変更 | `deps()` に `commentStore` と `getCommenter` を足す。reissue の permission 引継ぎ、comment リンク発行、view 応答の `permission`、共有解除でコメントが消えることのケースを足す |
| 新規 `shareCommentStore.ts` | `ShareCommentStore`、`ShareCommentThreadRecord`、`ShareCommentRecord`、`createCloudflareShareCommentStore`、`readD1Changes` | 新規 | D1 の `share_comment_threads`・`share_comments` の SQL。条件付き INSERT（上限・スレッド存在）の結果を `meta.changes` で判定する |
| 新規 `shareCommentService.ts` | `createShareCommentService`、`ShareCommentService`、`CommentAccess` | 新規 | `resolveAccess(scope, { requireActor })` でアクセス解決（404 / 401）を分け、操作関数（一覧・スレッド作成・返信・解決・再開・コメント削除）は `CommentAccess` だけを受け取る。能力判定もここ（設計 §6.3） |
| 新規 `handleShareCommentsApi.ts` | `handleListCommentThreads`・`handleCreateCommentThread`・`handleReplyCommentThread`・`handleResolveCommentThread`・`handleReopenCommentThread`・`handleDeleteComment`（いずれも `scope: ShareCommentsScope` を受け取り、token / owner の両経路で共用。設計 §8.2 の表） | 新規 | Route Handler の本体。設計 §6.3 の判定順（経路のレート制限 → `resolveAccess` → 書込みレート制限 → Content-Type・本文サイズ・入力検証 → 操作）。resolve / reopen / DELETE は本文を読まず Content-Type も検査しない |
| 新規 `resolveShareLinkByToken.ts` | `resolveShareLinkByToken` | 新規 | `viewByToken` 内のトークン→リンク→マップ解決を切り出す（閲覧とコメントで同じ判定） |
| 新規 `loadCurrentShareDocument.ts` | `loadCurrentShareDocument` | 新規 | `viewByToken` 内の revision→R2→sha256 照合を切り出す（閲覧とスレッド作成のノード検証で共有） |
| 新規 `testing/memoryShareCommentStore.ts` | `createMemoryShareCommentStore` | 新規 | テスト用。条件付き INSERT と上限を D1 と同じ意味で再現する |

### 1.2 Route Handlers（`client/src/app/api/share/`）

| ファイル | 区分 | 今回の扱い |
|---|---|---|
| `maps/route.ts`、`maps/[id]/route.ts`、`maps/[id]/publish/route.ts`、`links/[id]/revoke/route.ts` | 参照 | 変更なし（`deleteShare` の中身だけ変わる） |
| `maps/[id]/links/route.ts`、`links/[id]/reissue/route.ts` | 参照 | ルートは変更なし（service 側で permission を扱う） |
| `view/[token]/route.ts` | 参照 | ルートは変更なし（応答に `permission` が増える） |
| 新規 `view/[token]/comment-threads/route.ts` | 新規 | GET 一覧 / POST スレッド作成（トークン） |
| 新規 `view/[token]/comment-threads/[threadId]/replies/route.ts` | 新規 | POST 返信（トークン） |
| 新規 `view/[token]/comment-threads/[threadId]/resolve/route.ts`、`.../reopen/route.ts` | 新規 | POST 解決 / 再開（トークン） |
| 新規 `view/[token]/comments/[commentId]/route.ts` | 新規 | DELETE コメント削除（トークン） |
| 新規 `maps/[id]/comment-threads/route.ts` ほか、上と同じ形の `maps/[id]/...` 一式 | 新規 | 所有者用（トークンなし） |

### 1.3 ドメイン（`client/src/domain/share/`）

| ファイル | 関数・型 | 区分 | 今回の扱い |
|---|---|---|---|
| `assertViewPermission.ts` | `assertViewPermission` | 変更（置換） | 新規 `shareLinkPermission.ts` の `parseShareLinkPermission` / `assertIssuableLinkPermission` に置き換え、呼び出し元（`shareService.ts` の `createLink`・`viewByToken`）を移したうえでファイルを削除する |
| `planShareLinkCreate.ts` | `planShareLinkCreate`、`ShareLinkCreatePlan` | 変更 | 入力に `permission: ShareLinkPermission` を足し、`ShareLinkCreatePlan.permission` を `ShareLinkPermission` にする。`viewByToken` の probe 呼び出しは `tokenHash` 直接呼び出しへ置き換える |
| `shareLink.ts` | `ShareLinkIssued`、`CreateShareValue` | 変更 | `ShareLinkIssued` に `permission` を足す（発行直後の表示で「閲覧」「コメント可」を出す） |
| `shareResult.ts` | `ShareResult` | 参照 | そのまま使う |
| `shareSession.ts` | `ShareSession`、`ShareOwner`、`toShareSession`、`requireOwner` | 変更 | `ShareCommenter`、`toShareCommenter`、`requireCommenter` を追加する。既存の `toShareSession`（email 必須）は変えない |
| `tokenHash.ts` | `tokenHash` | 参照 | 変更なし |
| `planShareViewLoad.ts` | `planShareViewLoad`、`planShareViewDocumentParse`、`ShareViewLoadPlan`、`shareViewLoadFailureMessage` | 変更 | 入力を `ShareResult<{ documentJson; permission }>` にし、`ready` に `permission` を持たせる。`planShareViewDocumentParse(parsed, permission)` に引数を足す。未知の permission は `viewLoadFailed` |
| `parseShareViewDocument.ts` | `parseShareViewDocumentJson`、`asShareViewDocument` | 参照 | 変更なし |
| `shareMessages.ts` | `SHARE_MESSAGES` | 変更 | 共有ダイアログ側の文言（`createCommentLink`、`permissionView`、`permissionComment`、`deleteShareCommentsWarning` 等）を足す。コメント UI の文言は新規 `shareCommentMessages.ts` に分ける |
| `shareOperationMessages.ts` | `shareOperationFailureMessage` | 参照 | 共有ダイアログはそのまま。コメント用は新規 `shareCommentOperationMessages.ts` |
| `shareLocalMetaProjection.ts` | `ShareListItem`、`ShareListLinkProjection` | 参照 | `permission: string` は既にある。変更なし |
| `shareListMutations.ts` | `applyRevokeToShareList`、`applyReissueToShareList`、`shareListHasActiveLink` | 参照 | 関数は変更なし。呼び出し側（`useMapEditorShare`）が新リンクの permission に旧リンクの値を渡す |
| `shareDialogModel.ts` | `listActiveShareLinksForMap`、`ShareDialogLinkRef`、`formatShareLocalMetaSummary` | 変更 | `ShareDialogLinkRef` と戻り値に `permission` を足す（一覧で「閲覧」「コメント可」を出す） |
| `shareNotice.ts` | `ShareNoticeState`、`clearShareNotice`、`publishShareSuccess`、`publishShareError` | 参照 | コメント UI の通知枠でも同じ関数を使う（L-166） |
| `shareOpenGuards.ts` | `resolveShareOpenBlocked`、`shareOpenBlockedMessage` | 参照 | コメントダイアログのガードは新規 `shareCommentsOpenGuards.ts`（競合では塞がない点が異なる） |
| 新規 `shareLinkPermission.ts` | `ShareLinkPermission`、`parseShareLinkPermission`、`assertIssuableLinkPermission`、`linkPermissionAllowsComments` | 新規 | `"view" | "comment"` |
| 新規 `shareComment.ts` | `ShareCommentView`、`ShareCommentThreadView`、`ShareCommentListValue`、`ShareCommentViewer` | 新規 | API の応答型（server / client の正本） |
| 新規 `shareCommentLimits.ts` | `SHARE_COMMENT_BODY_MAX_LENGTH`、`SHARE_COMMENT_AUTHOR_NAME_MAX_CODE_POINTS`、`SHARE_COMMENT_NODE_LABEL_SNAPSHOT_MAX_CODE_POINTS`、`SHARE_COMMENT_MAX_THREADS_PER_MAP`、`SHARE_COMMENT_MAX_COMMENTS_PER_MAP`、`SHARE_COMMENT_MAX_COMMENTS_PER_THREAD`、`SHARE_COMMENT_MAX_BODY_BYTES` | 新規 | クライアントとサーバーが同じ値を import する |
| 新規 `normalizeShareCommentBody.ts` | `normalizeShareCommentBody` | 新規 | 本文の正規化と長さ判定（クライアントとサーバーで同じ関数・L-858 / L-836） |
| 新規 `normalizeShareCommentAuthorName.ts` | `normalizeShareCommentAuthorName` | 新規 | サーバー専用で使う（表示名の切り詰め） |
| 新規 `normalizeShareCommentNodeLabel.ts` | `normalizeShareCommentNodeLabel` | 新規 | サーバー（スナップショット作成）とクライアント（現在ラベル表示）の両方で使う（ラベルの切り詰め） |
| 新規 `sanitizeShareCommentSingleLine.ts` | `sanitizeShareCommentSingleLine` | 新規 | 表示名・ラベルの共通処理（制御文字除去・前後空白除去・コードポイント数での切り詰め） |
| 新規 `shareCommentCapabilities.ts` | `resolveShareCommentCapabilities` | 新規 | 所有者 / 作成者 / 投稿者 / その他の能力判定の唯一の純関数（`{ canResolve, canDelete }` を返す） |
| 新規 `classifyShareCommentThreads.ts` | `classifyShareCommentThreads`、`countOpenThreadsByNode` | 新規 | 表示中の文書に対する「ノードあり」「削除されたノード」の分類と、印の件数 |
| 新規 `shareCommentMessages.ts`、`shareCommentOperationMessages.ts` | `SHARE_COMMENT_MESSAGES`、`shareCommentOperationFailureMessage` | 新規 | 固定日本語文言 |
| 新規 `shareCommentsOpenGuards.ts` | `resolveCommentsOpenBlocked` | 新規 | 学習中・再生中のみ拒否 |
| 新規 `shareCommentListMutations.ts` | `replaceThreadInList`、`removeCommentFromList` | 新規 | 書込み応答で一覧の 1 スレッドを差し替える（`removeCommentFromList` は `threadDeleted` またはコメント 0 件でスレッドごと除く） |

### 1.4 サービス・クライアント（`client/src/services/share/`）

| ファイル | 関数・型 | 区分 | 今回の扱い |
|---|---|---|---|
| `shareApiClient.ts` | `createShareApiClient`、`ShareApiClient`、`parseShareResult`、`resolveFetch` | 変更 | `createLink(sharedMapId, permission)` にする（現状は本文に `"view"` 固定）。`viewByToken` の型を `{ documentJson; permission: string }`（サーバーの生値。`planShareViewLoad` で parse する）にする。`parseShareResult` と `resolveFetch` はコメント client から使うため export する |
| `d1Client.ts` | `createD1Client`、`D1Client`、`D1ExecResult` | 変更 | 失敗時の例外を `D1QueryError`（`kind: "no-such-table" \| "failed"`、`message` は従来どおり `d1-query-failed`）にする（共有解除でコメント表の欠落だけを許容するため）。`meta` は `unknown` のまま。`changes` の読取は `shareCommentStore.ts` の `readD1Changes` で検証する |
| `r2Client.ts` | `createR2Client` 等 | 参照 | 変更なし |
| 新規 `shareCommentsApiClient.ts` | `createShareCommentsApiClient`、`ShareCommentsApiClient`、`ShareCommentsScope` | 新規 | `{ kind: "token"; token }` / `{ kind: "owner"; sharedMapId }` の 2 つの基底 URL を 1 つの client で扱う |

### 1.5 認証

| ファイル | 関数・型 | 区分 | 今回の扱い |
|---|---|---|---|
| `client/src/auth.ts` | `handlers`、`auth`、`signIn`、`signOut`、`callbacks.jwt`、`callbacks.session` | 参照 | 変更なし。`session.user.name` は Auth.js 既定で Google の名前が入る（`token.name`）。`sub` を `session.user.id` に入れる既存の処理をそのまま使う |
| `client/src/types/next-auth.d.ts` | `Session.user` | 参照 | `DefaultSession["user"]` に `name` が含まれるので変更なし |
| `client/src/hooks/useShareSession.ts` | `useShareSession`、`ShareSessionState` | 参照 | 所有者側はそのまま |
| 新規 `client/src/hooks/useShareCommenterSession.ts` | `useShareCommenterSession` | 新規 | `useSession` → `toShareCommenter`。loading と未ログインを分ける |
| `client/src/components/auth/AuthSessionProvider.tsx` | `AuthSessionProvider` | 参照 | `app/layout.tsx` で全ページを包んでいるので `/share/[token]` でも `useSession` が使える |
| `client/src/app/page.tsx` | `handleShareLogin`（`signIn("google")`）、`shareDialogOpen` | 参照 | 所有者のコメントダイアログからのログインは既存 `onShareLogin` を再利用する |

### 1.6 所有者 UI（編集シェル）

| ファイル | 関数・型・props | 区分 | 今回の扱い |
|---|---|---|---|
| `client/src/components/layout/ShareDialog.tsx` | `ShareDialog`、`ShareDialogProps`（`onCreateLink`、`onReissueLink`、`lastIssuedLink`） | 変更 | 「コメントリンクを追加」ボタン（`onCreateCommentLink`・必須 prop）、リンク行の権限表示、発行直後の URL 枠に権限表示、共有解除ボタン近くにコメントも消える旨の注意 |
| `client/src/hooks/useMapEditorShare.ts` | `useMapEditorShare`、`onCreateLink`、`onReissueLink`、`runOperation` | 変更 | `onCreateCommentLink` を追加。`onReissueLink` で `applyReissueToShareList` に渡す新リンクの `permission` を再発行 API の成功値 `ShareLinkIssued.permission`（サーバー確定値）にする（現状 `"view"` 固定）。`onCreateLink` は `createLink(sharedMapId, "view")` を明示する |
| `client/src/components/layout/ShareControl.tsx` | `ShareControl` | 参照 | 新規 `CommentsControl` は同じ見た目・同じ props 形にする |
| `client/src/components/map/MapEditor.tsx` | `useMapEditorShare` 呼び出し、`share.localMeta`、`resolveMapEditorModalsBlockEditing` 呼び出し、`ShareControl` 配置、`ShareDialog` 配置、`MapStage` / `OutlineEditor` / `NodeDetailPanel` への props | 変更 | `useMapEditorComments` の配線、`CommentsControl` と `MapCommentsDialog` の配置、`MapStage` へ `commentNodeCounts`、`NodeDetailPanel` へ `commentSummary` / `onOpenNodeComments` / `openNodeCommentsDisabledReason`。コメントからノードへ移動する配線（`selectNode`・`canvasFocus.issueRequest`）は足さない（#75） |
| `client/src/domain/map/mapEditorModalBlocking.ts` | `MapEditorModalBlockingInput`、`resolveMapEditorModalsBlockEditing` | 変更 | `commentsDialogOpen` を足す（編集ショートカット停止・音声即停止の正本） |
| `client/src/domain/map/mapEditorCrossFeatureLocks.ts` | `resolveMapEditorCrossFeatureLocks` | 参照 | 変更なし |
| `client/src/components/layout/NodeDetailPanel.tsx` | `NodeDetailPanel`（各 `Node*Section` の並び） | 変更 | 必須 props `commentSummary`・`onOpenNodeComments`・`openNodeCommentsDisabledReason` を足し、新規 `NodeCommentsSection` を `NodeBacklinksSection` の後に置く |
| `client/src/components/map/MapStage.tsx` | `MapStageProps`（`taskProgress`、`pinnedNodeIds`）、`useRenderedMapScene` 呼び出し | 変更 | 必須 prop `commentNodeCounts` を足して scene へ渡す |
| 新規 `client/src/hooks/useMapEditorComments.ts` | `useMapEditorComments` | 新規 | 所有者の一覧取得・書込み・世代管理・通知 |
| 新規 `client/src/components/layout/CommentsControl.tsx`、`MapCommentsDialog.tsx`、`NodeCommentsSection.tsx` | — | 新規 | 所有者 UI |
| 新規 `client/src/components/share/ShareCommentThreadList.tsx`、`ShareCommentComposer.tsx` | — | 新規 | スレッド一覧と投稿欄。所有者ダイアログと閲覧パネルの両方で使う（編集系 import を持たない）。削除の確認（`components/layout/repeatedEnterClick.ts` の `preventRepeatedActivationClick` を付ける）、スレッド ID キーの返信下書き、操作後のフォーカス移動先を持つ（設計 §7.4） |

### 1.7 描画（Pixi）

| ファイル | 関数・型 | 区分 | 今回の扱い |
|---|---|---|---|
| `client/src/components/map/pixi/renderMapNodes.ts` | `RenderMapNodesOptions`、`renderMapNodes`（`taskProgress` バッジの描画箇所） | 変更 | 必須 `commentNodeCounts: ReadonlyMap<number, number>` を足し、未解決件数が 1 以上のノードにだけ左下の角に小さな件数バッジを描く（他の角印と重ならないため） |
| `client/src/components/map/pixi/renderMapScene.ts` | `RenderMapSceneOptions`、`renderMapScene` | 変更 | `commentNodeCounts` を素通しする |
| `client/src/components/map/useRenderedMapScene.ts` | `useRenderedMapScene`、`UseRenderedMapSceneOptions` | 変更 | 分割代入と依存配列に `commentNodeCounts` を足す |
| `client/src/components/map/testing/AutoLayoutMapStageHarness.tsx` | `MapStage` を描くテスト用ハーネス | 変更 | 必須 `commentNodeCounts` に `EMPTY_COMMENT_NODE_COUNTS`（`renderMapNodes.ts` から export）を渡す |
| `client/src/domain/nodes/nodeTaskProgressMapLayout.ts` | `computeTaskProgressMapLabelLayout` 等 | 参照 | バッジ位置が進捗バッジと重ならないことの確認だけ |

### 1.8 閲覧シェル（`/share/[token]`）

| ファイル | 関数・型・props | 区分 | 今回の扱い |
|---|---|---|---|
| `client/src/app/share/[token]/page.tsx` | `ShareTokenPage`、`metadata`（`robots`、`referrer: "no-referrer"`） | 参照 | 変更なし |
| `client/src/app/share/[token]/ShareViewerPage.tsx` | `ShareViewerPage`、`ShareViewerPageInner`、`LoadState` | 変更 | `ready` の `permission` が `"comment"` のときだけ `ShareCommentsPanel` を組み立てて `ShareViewer` に渡す。コメント対象ノードの選択 state を持つ |
| `client/src/components/share/ShareViewer.tsx` | `ShareViewer`、`ShareViewerProps` | 変更 | 必須 prop `commentsPanel: ReactNode \| null` と `commentTarget: ShareCommentTarget \| null` を足す。`null` のときコメント UI を一切描かない |
| `client/src/components/share/ShareMapView.tsx` | `ShareMapView`、`createNodePointerDownHandler`（現状 no-op）、`useRenderedMapScene` 呼び出し | 変更 | 必須 prop `commentTarget`。非 null のときだけ、ノードの pointerdown で候補を控え、移動量 4px 以下の pointerup で対象ノードを選ぶ（パンと区別）。`selectedNodeIds` と `commentNodeCounts` を渡す。null なら現状どおり（空 Map・空選択・no-op） |
| `client/src/components/share/ShareOutlineView.tsx` | `ShareOutlineView` | 変更 | 必須 prop `commentTarget`。非 null のとき行に件数と「コメント」ボタンを出す |
| 新規 `client/src/components/share/ShareCommentsPanel.tsx` | `ShareCommentsPanel` | 新規 | comment リンク専用。一覧・ログイン導線・投稿・返信・解決・削除 |
| `client/src/components/layout/EditorViewModeControl.tsx` | `EditorViewModeControl` | 参照 | 変更なし |

### 1.9 ドキュメント

| ファイル | 区分 | 今回の扱い |
|---|---|---|
| `docs/setup/share-setup.md` | 変更（Task 9） | §4 に Phase 38 の D1 DDL（`share_comment_threads`・`share_comments`）の追加手順と、既存 `share_links` の定義を確かめる手順（`sqlite_master` で `sql` を見て、`permission` に `'comment'` を拒む CHECK があれば退避して作り直す）。§6 に確認手順、§7 の「comment 権限・コメント UI」を対象外から外す。Phase 37 には DDL の正本が無い（設計書 §5.1 は論理表のみ）ことを前提にする |
| `docs/specifications/features.md` | 変更 | 「40. ノードコメントと解決管理（Phase 38）」を追加 |
| `docs/specifications/api.md` | 変更 | コメント API の節を追加 |
| `docs/testing/browser-test-cases.md` | 変更 | 「AQ. ノードコメントと解決管理（Phase 38）」を追加 |
| `ROADMAP.md` | 変更 | 096・097 を完了、098 は未完了のまま。現在地と最終更新 |

---

## 第 2 部 操作入口インベントリ（L-061）

### 2.1 判定語と列

判定語は Phase 37 inventory と同じ（非表示 / 無効 / 拒否 / 不可 / 無関係 / 有効 / ログイン導線 / 即停止）。本 Phase で使う列:

- 所有者シェル: **未ログイン × 所有者・未共有 × 所有者・共有中**、および **保護 × 競合※ × 学習中 × 再生中 × listening**。
- 閲覧シェル: **view リンク × comment リンク・未ログイン × comment リンク・ログイン済み（作成者でない） × comment リンク・ログイン済み（作成者） × comment リンク・所有者がログイン**。

※競合: `conflictState === "conflict"` と `externallyDeleted`。  
※「所有者・共有中」: `share.localMeta.status === "present"`（`sharedMapId` あり）。サーバーで既に消えていれば API が 404 を返し、ダイアログはエラー表示（§2.4 の C3-E）。  
※「未ログイン」列は、ローカルメタが present（このブラウザで共有済み）でログインしていない状態を指す。ローカルメタが present でなければ、ログイン状態に関係なく「所有者・未共有」列の判定（C3 は無効）が優先する。

### 2.2 所有者シェルの入口（C 系）

| # | 入口 | 未ログイン | 所有者・未共有 | 所有者・共有中 | 実装（予定） |
|---|---|---|---|---|---|
| C1 | 共有ダイアログ「コメントリンクを追加」 | **拒否**（ダイアログはログイン導線のみ） | **不可**（ボタン非表示。先に共有を開始） | **有効**（`current_revision_id` 非 null が条件。サーバーでも検査） | `ShareDialog` `onCreateCommentLink` |
| C2 | 共有ダイアログのリンク行（権限表示・失効・再発行） | — | — | **有効**。再発行は **権限を引き継ぐ** | `ShareDialog`、`useMapEditorShare.onReissueLink` |
| C3 | ヘッダー「コメント」（`CommentsControl`）→ `MapCommentsDialog` | **有効**（ダイアログ内はログイン導線） | **無効**（理由: 「共有中のマップだけコメントを使えます」） | **有効** | `CommentsControl`、`MapCommentsDialog` |
| C4 | 右パネル `NodeCommentsSection`（件数・「コメントを開く」） | **非表示** | **非表示** | 一覧 `ready` のとき **有効**（選択ノードで絞った `MapCommentsDialog` を開く。学習中・再生中は理由付き無効） | `NodeDetailPanel` |
| C5 | マップ上の件数バッジ（未解決スレッド数） | **非表示**（空 Map） | **非表示** | 一覧 `ready` のとき表示。`error`・`loading` では空 Map | `MapStage` → `renderMapNodes` |
| C6 | ダイアログ内操作: スレッド作成・返信・解決・再開・コメント削除（確認つき）・再読み込み。スレッド丸ごと削除とノードへ移動は置かない（設計 決めたこと 8・非目標 #75） | ログイン導線 | — | **有効**（能力はサーバー応答の `canResolve` / `canDelete`） | `MapCommentsDialog`、`ShareCommentThreadList`、`ShareCommentComposer` |
| C7 | 共有ダイアログ「共有を解除」 | 拒否 | — | **有効**。コメントも物理削除される旨をボタン付近に表示 | `ShareDialog` |

### 2.3 C×保護・競合・学習・再生・listening

| # | 入口 | 保護 | 競合※ | 学習中 | 再生中 | listening | 備考 |
|---|---|---|---|---|---|---|---|
| C1, C2, C7 | 共有ダイアログ内 | Phase 37 §1.2 どおり | 同左（拒否） | 同左 | 同左 | 同左 | 共有ダイアログの既存ガードを継承 |
| C3 | コメントダイアログを開く | **有効** | **有効**（ローカル文書を書き換えない。サーバーのコメントだけを扱う） | **拒否** | **拒否** | **即停止**のうえ開く可 | `resolveCommentsOpenBlocked`。`commentsDialogOpen` を `resolveMapEditorModalsBlockEditing` に足す |
| C4 | 右パネルのコメント節「コメントを開く」 | **有効** | **有効** | **無効**（理由付き。C3 と同じ文言を `title`・`aria-label` に） | **無効**（理由付き） | **不可**（listening 中は本体が inert。ヘッダーの C3 から開けば即停止） | 開く処理は C3 と同じガードを通す（入口を 1 本化）。右パネルは既存の `<div inert={listening}>` の中にあり、実装は変えない |
| C5 | バッジ | 表示 | 表示 | 表示（学習中のラベル伏せとは独立。件数だけ） | 表示 | 表示 | 表示のみで操作なし |

`editorShortcutsEnabled` の積に `commentsDialogOpen === false` が入る（`resolveMapEditorModalsBlockEditing` 経由）。`MapCommentsDialog` は `ShareDialog` と同じく根の兄弟（`inert` の外）に置く。

### 2.4 所有者シェルの状態別表示（L-002）

| # | 状態 | ダイアログの表示 | バッジ・右パネル |
|---|---|---|---|
| C3-L | 一覧 `loading` | 「コメントを読み込んでいます…」。書込みボタンは無効 | 空（前回の `ready` の値を出さない） |
| C3-R | 一覧 `ready`・0 件 | 「まだコメントはありません。」 | 空 |
| C3-E | 一覧 `error`（404 を含む） | 固定文言のエラー＋「再読み込み」。0 件の案内は出さない | 空 |
| C3-S | セッション loading | 「ログイン状態を確認しています…」。ログイン導線を出さない（L-463） | 空 |

### 2.5 閲覧シェルの入口（V-C 系）

| # | 入口 | view リンク | comment・未ログイン | comment・ログイン（作成者でない） | comment・ログイン（作成者） | comment・所有者ログイン |
|---|---|---|---|---|---|---|
| V-C1 | コメントパネル（スレッド一覧・解決済みの折りたたみ・削除されたノード節） | **不可（未マウント）** | **有効**（読むだけ） | **有効** | **有効** | **有効** |
| V-C2 | マップ / アウトラインでのコメント対象ノードの選択と件数バッジ（マップはしきい値以下のタップで選択。折りたたみで隠れたノードは展開しない） | **不可（未マウント。選択 no-op・空 Map）** | 有効（選択と表示のみ） | 有効 | 有効 | 有効 |
| V-C3 | 「Google でログインしてコメント」 | 不可（未マウント） | **ログイン導線**（`signIn("google", { redirectTo: 現在のパス })`） | 非表示 | 非表示 | 非表示 |
| V-C4 | スレッド作成（選択ノードに対して） | 不可 | 非表示（ログイン導線のみ） | **有効** | **有効** | **有効** |
| V-C5 | 返信 | 不可 | 非表示 | **有効**（未解決スレッドのみ。解決済みは再開が先） | 同左 | 同左 |
| V-C6 | 解決・再開 | 不可 | 非表示 | **非表示**（`canResolve=false`） | **有効**（自分が作ったスレッド） | **有効**（全スレッド） |
| V-C7 | コメント削除（共通部品の確認を経る） | 不可 | 非表示 | 非表示（他人のコメント） / **有効**（自分のコメント） | **有効**（自分のコメント） | **有効**（全コメント） |
| V-C8 | （欠番。スレッド丸ごと削除は持たない。最後のコメント削除でスレッドが消える） | — | — | — | — | — |
| V-C9 | 「再読み込み」 | 不可 | 有効 | 有効 | 有効 | 有効 |

ボタンの出し分けはサーバー応答の能力（`canResolve`・`canDelete`・`viewer.canPost`）だけで行い、クライアントで作成者を判定しない（L-1032）。サーバーは同じ判定を書込み時に再検査する。

### 2.6 閲覧シェルにマウントしないもの（V-UM の追加分）

Phase 37 の V-UM（MapEditor・編集入口・書き出し・共有ダイアログ一式の未マウント）を維持したうえで、次も閲覧シェルに載せない。

| # | 対象 | 閲覧シェル | 根拠 |
|---|---|---|---|
| V-C-UM1 | view リンクでのコメント UI 一式（`ShareCommentsPanel`、件数バッジ、ノード選択、ログイン導線） | **不可（未マウント）**。`commentsPanel={null}`・`commentTarget={null}` | 決めたこと 3。view リンクの既存保持者へコメントと投稿者名を後から見せない |
| V-C-UM2 | `MapCommentsDialog`・`CommentsControl`・`NodeCommentsSection`・`useMapEditorComments` | **不可（import しない）** | 所有者シェル専用 |
| V-C-UM3 | 所有者用コメント API（`/api/share/maps/:id/comment-threads...`）の呼び出し | **不可**（`ShareCommentsScope` は `kind: "token"` のみを組み立てる） | L-901 |
| V-C-UM4 | コメント本文の Markdown 表示・自動リンク・HTML 描画 | **不可**（プレーンテキストのみ） | XSS 防止（設計 §7.4） |

### 2.7 テスト所有者（Task 番号は設計 §13）

| # | Task | 主な検証 |
|---|---|---|
| C1, C2, C7 | 5 | comment リンク発行・権限表示・再発行の権限引継ぎ（成功値の permission）・解除の注意文 |
| C3, C4 | 8b | ガード表（§2.3）、理由付き無効、`commentsDialogOpen` 中の編集ショートカット停止 |
| C3-L/R/E/S, C6 | 8a | 状態別表示（§2.4）、削除されたノード節、ノードへ移動のボタンが無いこと、操作後のフォーカス、要求番号による古い一覧の破棄 |
| C5 | 6（描画）・8b（配線） | バッジ描画単体、`MapStage` 必須 prop の配線（L-060） |
| 削除確認・下書き・IME・二重送信・XSS | 7a | `ShareCommentThreadList` / `ShareCommentComposer` の単体（両シェル共通） |
| V-C1–V-C9 | 7b | 権限 × ログイン状態の出し分け、タップ判定、操作後のフォーカス、要求番号による古い一覧の破棄 |
| V-C-UM1 | 7b | view リンクでコメント関連要素 0 件、コメント API を呼ばない |
| V-C-UM2, V-C-UM3 | 7b | import 境界（閲覧シェルのモジュールが所有者 UI を import しない） |
| 既存共有 API の変更 | 3a | permission 発行・引継ぎ、view 応答の permission、共有解除のコメント削除と `no-such-table` 許容 |
| コメントサービス | 3b | 能力・上限・補償・冪等・読んでから書くまでの消失 |
| コメント API 全行 | 3c | 設計 §6.2 の権限表を 1 セル 1 ケースで固定、§6.3 の判定順 |
| 実環境の D1（L-059） | 9（手動 AQ 節） | comment リンクで投稿・解決、上限到達で 409、Phase 38 の DDL 未実行環境で共有解除が成功 |

---

## Task 0 で確認した差分

第 1 部の「変更」「参照」に挙がった既存ファイル（`client/src` 配下 56 ファイル、docs 5 ファイル）と関数・型・props 名がすべて実在し、名前が一致することを `grep` で確認した。新規予定のファイルはいずれも未作成であることも確認した。現状の挙動の記述（`planShareLinkCreate` の `permission: "view"` 固定、`viewByToken` の probe 呼び出し、`shareApiClient.createLink` の本文 `"view"` 固定、`useMapEditorShare.onReissueLink` の `permission: "view"` 固定、`d1Client` の `d1-query-failed`・`meta: unknown`、`requireOwnedMap` 非 export、`ShareLinkRecord.permission: string`）も実コードと一致した。

- `handleShareApi.ts` の `clientIpFromRequest` は既に `export` されていた。1.1 の該当行を「`readJsonBody`・`asRecord`・`withViewResponseHeaders` を export する（`clientIpFromRequest` は既存の export を使う）」に直した。

## Task 9 で反映した実装との差分

実装（`client/src` 配下）と本棚卸し・設計を突き合わせ、次を反映した。

- [x] §2.3 の C4（右パネル「コメントを開く」）の listening 列を「不可（listening 中は本体が inert。ヘッダーの C3 から開けば即停止）」に直した。右パネルは `MapEditor` の `<div inert={listening}>` の中にあるため押せない（実装は変えない）。
- [x] コメント件数バッジはノードの左下の角（`node.x`, `node.y + node.height`）。左上=ピン・右上=リンク・右下=ロックの角印と進捗バッジに重ならない（§1.7 と設計 §7.2 は記述済み）。
- [x] 一覧と書込みの状態は共通 hook `client/src/hooks/useShareCommentsController.ts`（`generationKey`・`scope`）に置き、`useMapEditorComments`・`useShareViewerComments` はそれを包む。
- [x] 一覧の節分けは `client/src/components/share/shareCommentThreadSections.ts`（`toShareCommentThreadSections`・`toShareCommentThreadSectionsForNode`）、新規スレッドのノード ID キーの下書きは `client/src/components/share/useNodeKeyedDrafts.ts` に抽出し、`ShareCommentsPanel` と `MapCommentsDialog` で共用する（`ShareCommentThreadSections` 型が `components/share` にあるため domain には置かない）。
- [x] `MapCommentsDialog` の絞り込みはラジオの組で、`fieldset` の見えない凡例に `SHARE_COMMENT_MESSAGES.filterLegend`（「絞り込み」）を使う。
- [x] 共有ダイアログの失効・再発行の成功文言は、comment リンクにも使うため「リンクを失効しました。」「リンクを再発行しました。」にした（Phase 37 は「閲覧リンクを…」）。
