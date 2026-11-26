# Phase 37（094/095）: 共有の基盤と閲覧公開 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development. 作業場所: メインのチェックアウトのブランチ `feat/phase37-share-view-link`（worktree 不使用）。**Do not commit** during `/feature`.

**Goal:** Google OAuth で所有者を識別し、ローカルマップを Cloudflare D1/R2 上のスナップショットとして共有し、推測困難トークンの閲覧専用ページを 1 PR で届ける（094・095）。

**Architecture:** 編集正本は localStorage。公開正本は R2 スナップショット＋D1 メタ。Next.js Route Handlers（Node）から D1 REST / R2 S3 互換 HTTP。閲覧は `/share/[token]` の専用シェル（MapEditor 非使用）。初回共有応答に view リンク同梱。

**Tech Stack:** Next.js App Router, Auth.js (Google), React, TypeScript, Jest, Cloudflare D1/R2 HTTP APIs

## Global Constraints

- 設計: `docs/superpowers/specs/2026-11-26-phase37-share-view-link-design.md`
- 見送りかんばん #64–#69
- L-061 inventory は **Task 0**（実装前）
- L-001 Result / L-002 欠落と空 / L-003 検証→書込順・再発行は新確定後に旧失効
- L-060 §10.1 必須 props 結合テスト
- L-166 §11.1 通知クリア（Task 4 で実装＋結合テスト）
- 他者リソース・失効トークンは **404**
- `expires_at` は常に **null**（UI/API で設定しない）
- レート制限・ボディサイズ上限（既存 JSON 上限に合わせる）を API に実装しテストする
- イラスト用 Cloudflare 資格情報と共有用を分離（`.env.example` に共有用名を列挙）
- TDD。コミットしない。日本語 UI。最終 `cd client && npm run verify`
- ROADMAP Phase 37（094・095）完了更新

## File Map

| 領域 | 主なファイル |
|------|----------------|
| inventory | Create `docs/superpowers/specs/2026-11-26-phase37-share-view-link-inventory.md` |
| Auth | Create Auth.js 設定・`/api/auth/[...nextauth]`・セッション取得 hook |
| Share domain | Create `client/src/domain/share/*`（token hash、permission、revision 遷移の純関数） |
| CF clients | Create `client/src/services/share/d1Client.ts` / `r2Client.ts`（HTTP・テストでモック） |
| Share API | Create `client/src/app/api/share/**` Route Handlers |
| Local meta | Modify library-meta または Create `shareLocalMeta` ストレージ |
| Owner UI | Create `ShareDialog` / header 入口・MapEditor 配線 |
| Viewer | Create `app/share/[token]/page.tsx` + 読み取り専用シェル |
| docs | features / overview / setup / browser-test-cases / ROADMAP |

## Review Focus

1. 未ログイン共有が成功扱いにならない
2. publish / 初回の部分失敗で空公開にならない
3. 再発行失敗で旧リンクが消えない
4. 閲覧頁に編集入口が無い
5. 一覧 loading/error/空の分離

---

### Task 0: L-061 inventory

**Files:** Create `docs/superpowers/specs/2026-11-26-phase37-share-view-link-inventory.md`

- 設計 §9 の S1–S6 ＋保護・競合・学習・プレゼン・listening 列
- E 行（既存編集入口×閲覧頁）とテスト所有者表

- [ ] inventory 作成

---

### Task 1: Auth.js Google

**Files:**
- Create: Auth.js 設定（Google provider）、`/api/auth/[...nextauth]/route.ts`
- Create: `useShareSession`（userId \| null）
- Tests: 未ログイン／ログイン済みのガードヘルパ
- `.env.example`: `AUTH_SECRET`, Google client 名、**共有用** `CF_SHARE_ACCOUNT_ID` / `CF_SHARE_API_TOKEN` / `CF_SHARE_D1_DATABASE_ID` / `CF_SHARE_R2_*`（イラスト用キーと別名）

**Interfaces:**（以降タスク共通。ここで定義した型を Task 2–5 が import）
```ts
type ShareResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

/** useShareSession の正本。null = 未ログイン */
type ShareSession = { userId: string; email: string } | null;

type ShareLinkIssued = {
  linkId: string;
  url: string; // 成功応答のキーは常に url（shareUrl ではない）
  token: string; // 一度きり。再表示 API なし
};

type CreateShareValue = {
  sharedMapId: string;
  link: ShareLinkIssued;
};
```

- [ ] RED/GREEN: セッション無しで `requireOwner(session): ShareResult<ShareSession>` が失敗

---

### Task 2: Share ドメイン＋ D1/R2 クライアント

**Files:**
- Create: 純関数＋tests、`d1Client` / `r2Client`（注入可能な fetch）

**Interfaces:**
```ts
function tokenHash(token: string, secret: string): string;
function assertViewPermission(permission: string): ShareResult<void>; // view 以外は失敗
function planPublishTransition(input: {
  currentRevisionId: string | null;
  nextRevisionId: string;
}): { nextCurrentRevisionId: string };
```

- Tests: hash 一方向、permission≠view 拒否、**リンク作成時 `expires_at` は常に null**

- [ ] RED/GREEN: ドメイン単体

---

### Task 3: Share API

**Files:** Create Route Handlers per 設計 §8

- `GET/POST /api/share/maps`（list / create+publish+link → `CreateShareValue`）
- `POST .../publish`, `POST .../links` → `ShareLinkIssued`, `POST .../revoke`
- **`POST /api/share/links/:id/reissue`** → `ShareLinkIssued`（新確定後に旧失効）
- `DELETE /api/share/maps/:id`: 順序固定（全リンク失効 → `current_revision_id` null → 全 R2 削除 → DB 削除）
- `GET /api/share/view/:token` → `ShareResult<{ documentJson: string }>`（miss/revoked は reason で 404）
- レート制限・ボディサイズ上限＋テスト

- [ ] RED/GREEN: API 契約

---

### Task 4: 所有者 UI＋ローカルメタ

**Files:** ShareDialog / Header / MapEditor / ローカルメタ / notice

**Interfaces:**
```ts
type ShareLocalMetaRead =
  | { status: "missing" }           // 未共有
  | { status: "present"; value: { sharedMapId: string; lastPublishedAt: string | null; linkActive: boolean } }
  | { status: "read-error"; error: string }; // 未共有に倒して上書きしない

type ShareDialogProps = {
  mapId: string;
  mapTitle: string;
  shareSession: ShareSession;
  localMeta: ShareLocalMetaRead;
  listState: "loading" | "ready" | "error";
  onCreateShare: () => Promise<ShareResult<CreateShareValue>>;
  onPublish: () => Promise<ShareResult<{ revisionId: string }>>;
  onCreateLink: () => Promise<ShareResult<ShareLinkIssued>>;
  onRevokeLink: (linkId: string) => Promise<ShareResult<void>>;
  onReissueLink: (linkId: string) => Promise<ShareResult<ShareLinkIssued>>;
  onDeleteShare: () => Promise<ShareResult<void>>;
  onLogin: () => void;
  dialogMouseClickedAtRef: React.RefObject<number | null>;
};
```

- Notice: §11.1 全行（閉鎖・mapId・再試行開始・成功で error 置換・同一文言再読み上げ・documentRevision）
- Tests: L-060 未配線 RED、listState error でメタ非破壊、L-166 の各クリア契機

- [ ] RED/GREEN: ダイアログ結合

---

### Task 5: 閲覧シェル

**Files:** `app/share/[token]/page.tsx` + 読み取り専用シェル

**Interfaces:**
```ts
type ShareViewerProps = {
  document: unknown | null; // 成功時の MapDocument。空と欠落を混同しない
  loadError: string | null; // 取得失敗・404
  viewMode: "map" | "outline";
  onViewModeChange: (mode: "map" | "outline") => void;
};
```

- 編集・書き出し・共有 UI を **import しない**（S6）
- Tests: L-060 未配線 RED（必須 props）、編集/書き出し 0 件、`loadError` vs 空 document、404、map/outline

- [ ] RED/GREEN: 閲覧頁

---

### Task 6: docs・ROADMAP

**Files:** `ROADMAP.md`, `docs/specifications/features.md`, `docs/architecture/overview.md`, setup 文書, `docs/testing/browser-test-cases.md`

- Phase 37 094・095 を完了表記、現在地更新
- browser-test-cases に手動: Google ログイン、別プロファイルでリンク閲覧、失効後 404、再発行後の旧 URL 無効

- [ ] docs 更新

---

## 完了条件

- [ ] `cd client && npm run verify` 成功
- [ ] inventory・必須 props・Result・404 統一が設計と一致
- [ ] ROADMAP Phase 37 完了
