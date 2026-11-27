# Phase 39（099/100）リアルタイム共同編集 — 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 共同編集セッション中に Yjs+Durable Object で同時編集し、他者の選択・ビューポートを表示する。単独編集は localStorage 正本のまま。

**Architecture:** Next CollabAPI（ticket・session）+ CF Durable Object（Yjs WS）+ MapEditor / `/collab/[token]`。サブエージェントは Task 単位・直列。

**Tech Stack:** Next.js Route Handlers, Auth.js, Yjs, Cloudflare Durable Objects, D1/R2（既存共有）, Jest

**設計:** `docs/superpowers/specs/2026-11-27-phase39-realtime-collab-design.md`

## Global Constraints

- 見送り: #66, #68, #78–#83
- L-001 Result / L-002 欠落と空 / L-003 書込順 / L-060 必須 props / L-061 inventory（Task 0）/ L-166 notice / L-1230–1233
- トランスポート正本は **Durable Objects**（PartyKit なし）
- DO コード正本パス: **`collab-worker/`**（リポジトリルート）。Next から ticket 署名鍵を共有
- edit 参加は `/collab/[token]`、閲覧は `/share/[token]` のまま
- `meta.nextId` atomic increment。衝突 seed は開始拒否
- 同時接続 8・超過 **429**
- 接続チケット寿命は **60 秒固定**（`CollabTicketClaims` は `{ sessionId, userId, exp }`。**`iat` は持たない**）。DO は共有署名鍵で **ローカル検証**（CollabAPI への毎回照会なし）
- `wsUrl` に edit 共有トークンを載せない（ticket は別チャネル。クエリ／fragment に edit token 禁止）
- 再接続: **2 分以内**（ハード上限 **120 秒**）は Yjs 再同期で復帰。再接続中（`reconnecting`）は **ticket 再発行 API**（`POST /api/collab/sessions/:id/ticket`、応答は短命 ticket **60 秒**）で新しい ticket を取り直してから WS 再接続する。**2 分超**はセッション脱落→UI `error`（再参加導線）。意図的 leave／end 成功後の `closed` は UI `idle`。**connecting / reconnecting** 中は入力ブロック（キューしない）
- 平文 edit トークン・ticket をログ／分析に出さない。awareness・文書更新にもレート制限（DO 側シングルトン相当）
- イラスト用 Cloudflare 資格情報と共有／共同編集用を分離（Task 7・setup）
- TDD。コミットしない。日本語 UI。最終 `cd client && npm run verify`
- ROADMAP Phase 39（099・100）完了更新

## File Map

| 領域 | 主なファイル |
|------|----------------|
| inventory | Create `docs/superpowers/specs/2026-11-27-phase39-realtime-collab-inventory.md` |
| codec | Create `client/src/domain/collab/*` |
| API | Create `client/src/app/api/collab/**`, `client/src/server/collab/**` |
| DO | Create `collab-worker/`（Durable Object + Yjs 同期） |
| UI | Modify MapEditor、Create `app/collab/[token]/*`, presence overlay |
| share | Modify share link API で `permission=edit` 許可 |
| docs | ROADMAP, features, overview, setup, `.env.example`, browser-test-cases |

## Review Focus

1. 未ログイン参加が成功扱いにならない
2. seed/export 失敗で空文書にならない
3. セッション中にタブ競合ガードが残って二重正本にならない
4. `/share` に編集・presence が無い
5. レート制限シングルトン・origin・no-store・Referrer
6. 2 分超切断で脱落、TTL 5 分の成果物退避と次回開始取込
7. 任意「公開を更新しますか？」が自動 publish にならない
8. ticket 60 秒固定・期限切れ拒否、wsUrl に edit token 非掲載
9. DO ローカル署名検証のみ（CollabAPI 非照会）
10. connecting でも入力ブロック（reconnecting のみに限定しない）

---

### Task 0: L-061 inventory

**Files:** Create `docs/superpowers/specs/2026-11-27-phase39-realtime-collab-inventory.md`

設計 §14 相当。少なくとも次を表にする（実装前）:

- 共同編集 UI 状態 `idle` / `connecting` / `active` / `reconnecting` / `error` と接続層 `connecting|active|reconnecting|closed|error` の対応表
- 既存入口 × 状態: 保存・タブ競合・学習・プレゼン・音声・共有ダイアログ・コメント・保護モード・マップ切替・アウトライン取込／書き出し
- Phase 36/37 の **機械列挙入口**（少なくとも JSON 読込・パレット MUTATING・AI・一括系）を行として含め、**共同編集中**の扱いを **1 列**で **`無効` / `Yjs経由` / `拒否` のいずれかのみ**に固定（語彙はこの 3 語に統一）
- `active` 中に無効化または拒否する入口の列（語彙は上に合わせる）
- `connecting` / `reconnecting` 中の入力ブロック列と、切断から **ハード上限 120 秒**超で脱落する列
- `/share/[token]` に共同編集 UI が **0 件**であること

- [x] inventory 完成

---

### Task 1: Yjs codec

**Files:** Create `client/src/domain/collab/mapDocumentYjs.ts` 等

**Interfaces:**
```ts
type CollabCodecResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "invalid-document" | "id-collision" | "encode-error" | "decode-error" };

function mapDocumentToYDoc(doc: MapDocumentV3): CollabCodecResult<Y.Doc>;
function yDocToMapDocument(ydoc: Y.Doc): CollabCodecResult<MapDocumentV3>;
function initialNextId(nodes: readonly Node[]): number;
```

**reason 語彙 ↔ 設計 §11（L-002）**:

| 設計の概念 | codec `reason` | API／取込側の代表 reason |
|---|---|---|
| `invalid`（文書・decode 不正） | `invalid-document` / `decode-error` | `invalid-document` |
| `missing`（成果物無し・空） | （codec 単体では出さない） | `export-empty`（空 artifact／空 export。空 MapDocument 成功に倒さない） |
| 開始拒否（ID 衝突） | `id-collision` | 開始失敗（session を `active` にしない） |
| 符号化失敗 | `encode-error` | seed 失敗（`seed-failed` 等。空 seed 成功にしない） |

- nodes は `Y.Map`（設計 §4.3）、`meta.nextId` = maxId+1
- Tests: 往復、空ノード、欠落と空、衝突で開始相当が失敗

- [x] RED/GREEN: codec

---

### Task 2: CollabAPI + D1/R2 メタ

**Files:** Create `client/src/app/api/collab/**`, `client/src/server/collab/**`；Modify `client/.env.example`（名前のみ）

**Interfaces:**
```ts
type CollabSessionRow = {
  id: string;
  ownerUserId: string;
  localMapId: string;
  sharedMapId: string | null;
  /** creating = seed 前。失敗したら ended にせず行削除または status=failed（公開しない） */
  status: "creating" | "active" | "ended" | "failed";
  artifactR2Key: string | null;
  createdAt: string;
  endedAt: string | null;
};

/** 接続チケット。寿命は 60 秒固定（設計 §15）。iat は持たない */
type CollabTicketClaims = {
  sessionId: string;
  userId: string;
  /** Unix 秒。発行時 floor(nowSec)+60 */
  exp: number;
};

/** sessions / join / ticket 再発行 成功応答。wsUrl に edit 共有トークンを含めない */
type CollabConnectResponse = {
  sessionId: string;
  ticket: string;
  wsUrl: string; // origin=env 正本。query/fragment に edit token 禁止
};

/** POST /api/collab/sessions 開始 body */
type CollabSessionStartBody = {
  localMapId: string; // 必須
  sharedMapId?: string; // 任意（未共有でも開始可）
  /** seed 用 MapDocument JSON 文字列。seedFromArtifact でないとき必須 */
  documentJson?: string;
  /** true なら前回 artifactR2Key から seed（空 artifact は拒否。空で上書きしない） */
  seedFromArtifact?: boolean;
};
```

- エンドポイント: sessions / join / end / GET / **ticket 再発行**（設計 §7・§7.1）
- `POST /api/collab/sessions/:id/ticket` — 所有者または当該セッション参加者。active セッションのみ。→ `CollabConnectResponse`（短命 ticket **60 秒**）。**reconnecting 中の再接続はこの API で ticket を取り直す**（旧 ticket の期限切れ後も 120 秒窓内なら再発行可）
- 書込順 §12。view/comment join → **404**。`no-active-session` → 404。上限 → 429
- `POST /api/collab/sessions`: body は上の `CollabSessionStartBody`（`localMapId` 必須。`documentJson` と `seedFromArtifact` のどちらかで seed。両方欠落や文書不正は active にしない）
- `GET /api/collab/sessions/:id`: 所有者または当該セッション参加者のみ。**非参加者は 404**
- ticket **60 秒固定**（`exp === floor(nowSec)+60`。**iat 差分は使わない**）、wsUrl origin=env、**wsUrl に edit token を載せない**、**成否とも** no-store（**401／404／429／ticket 失敗応答を含む**）、レート制限シングルトン、**ticket/token をログに出さない**
- 次回開始時に `artifactR2Key` があれば `seedFromArtifact: true` 取込オプション（空で上書きしない。失敗 reason は Task 1 対応表の `missing` → `export-empty`）
- RED チェックリスト:
  - [x] 未ログイン 401
  - [x] view/comment トークン join 404
  - [x] 失効・不明 404
  - [x] edit+ログイン・active session 成功
  - [x] no-active-session 404
  - [x] 429 上限
  - [x] no-store ヘッダ（成功・404）
  - [x] no-store ヘッダ（**401・429**、および ticket を含む失敗応答）
  - [x] seed 失敗で session が active にならない
  - [x] end の export 失敗で session は active のまま・localStorage 非破壊
  - [x] 空 export で localStorage を消さない
  - [x] レート制限がリクエスト跨ぎで効く（シングルトン。毎回 new しない）
  - [x] wsUrl origin が env 正本（x-forwarded-host を使わない）
  - [x] ticket 寿命 60 秒固定（発行直後 `claims.exp === floor(nowSec)+60`。**iat は claims に無く、差分 assert しない**）
  - [x] ticket 期限切れで WS／接続が拒否される
  - [x] ticket 再発行成功（owner／参加者・active）。期限切れの**旧** ticket は拒否のまま、再発行で得た**新** ticket は受理
  - [x] `documentJson` 欠落かつ `seedFromArtifact` でない開始 → active にしない
  - [x] `seedFromArtifact` で空 artifact → 拒否（空で上書きしない）
  - [x] 成功応答の `wsUrl` に edit 共有トークンが含まれない（query / fragment / path）
  - [x] `sharedMapId` なし（localMapId のみ）で開始が成功する
  - [x] GET 非参加者（当該 session の owner/参加者以外）→ 404

- [x] RED/GREEN: API 契約（**上記 RED 全項目完了後**に `[x]`）

---

### Task 3: Durable Object ルーム（`collab-worker/`）

**Files:** Create `collab-worker/**` + client connector in `client/src/services/collab/`

**Interfaces:**
```ts
type CollabTicketClaims = { sessionId: string; userId: string; exp: number };
type CollabConnectionState = "connecting" | "active" | "reconnecting" | "closed" | "error";
```

- ticket は **共有署名鍵によるローカル検証のみ**（設計 §7・§15）。**CollabAPI への毎回照会はしない**
- ticket 検証後 Yjs 同期。同時接続 8 → 429。期限切れ ticket → 拒否
- awareness・文書更新のレート制限。ticket 平文をログ禁止
- 切断: 2 分以内（120 秒）reconnect 可。再接続時クライアントは **Task 2 の ticket 再発行 API** で短命 ticket（60 秒）を取り直してから WS 接続する（旧 ticket の期限切れだけでは 120 秒窓を潰さない）。2 分超は room から脱落。全員切断後 TTL **5 分**で破棄前に成果物退避
- **所有者不在でも他者継続**。所有者／参加者とも ticket 再発行 API で復帰
- 接続層 → UI（Task 4 と同一）: `reconnecting` 失敗（120 秒超脱落含む）→ UI **`error`**。意図的 leave／end 成功後の `closed` → UI **`idle`**
- TTL 退避失敗は空文書を正本にしない（失敗記録・再開始促し。設計 §12.3）
- CI: memory mock DO

- RED チェックリスト:
  - [x] 接続成功（有効 ticket）
  - [x] 同時接続上限超過 → 429
  - [x] ticket 不正（署名改ざん）拒否
  - [x] ticket 期限切れ拒否（60 秒固定の帰結）
  - [x] DO が CollabAPI を照会せずローカル署名検証のみで受理／拒否する
  - [x] 2 分（120 秒）超切断で room 脱落
  - [x] 所有者切断後も他参加者が編集継続できる
  - [x] TTL 破棄前の成果物退避成功経路
  - [x] TTL 退避失敗でも空文書を正本にしない（失敗≠空 MapDocument 成功）

- [x] RED/GREEN: 接続・上限・ticket 不正／期限切れ・ローカル検証・TTL 退避・所有者不在継続・2 分脱落（**上記 RED 全項目完了後**に `[x]`）

---

### Task 4: MapEditor と `/collab/[token]`

**Files:** Modify MapEditor、Create `app/collab/[token]/*`, hooks

**Interfaces:**
```ts
type CollabParticipant = {
  userId: string;
  displayName: string;
  color: string;
};

/**
 * UI 状態。接続層 CollabConnectionState との対応（固定・inventory §1 と同型）:
 *  connecting→connecting, active→active, reconnecting→reconnecting,
 *  closed→idle（意図的 leave／end 成功後のみ）,
 *  closed→error（reconnecting 失敗・120 秒超脱落など異常閉鎖）,
 *  error→error
 */
type CollabSessionUi =
  | { status: "idle" }
  | { status: "connecting" }
  | { status: "active"; sessionId: string; role: "owner" | "editor" }
  | { status: "reconnecting"; sessionId: string; since: number }
  | { status: "error"; error: string };

/**
 * L-060 正本の分岐（設計 §6.2・§13 と同型）:
 * - CollabControl（ヘッダー制御）= 下記 props。presence Maps はここに含めない
 * - PresenceLayer（Task 5）= remoteSelections / remoteViewports
 * - MapEditor・`/collab/[token]` 組み立て = Control + Presence の両方を必須配線
 */
type CollabControlProps = {
  collabSession: CollabSessionUi;
  participants: readonly CollabParticipant[];
  participantsState: "loading" | "ready" | "error";
  onStartCollab: () => Promise<ShareResult<{ sessionId: string }>>;
  /** 参加者の退出（session は他人がいれば active のまま）→ 成功後 UI idle */
  onLeaveCollab: () => Promise<ShareResult<void>>;
  /** 所有者のみ。export + session end → 成功後 UI idle */
  onEndCollab: () => Promise<ShareResult<void>>;
  shareSession: ShareSession | null;
  /** シェル由来のダイアログクリック時刻（MapStage へ透過。省略不可・L-060） */
  dialogMouseClickedAtRef: React.RefObject<number | null>;
};
```

- ヘッダー: 接続状態、**参加者一覧（名前・色）**、開始／退出
- active: Yjs UndoManager（自操作のみ）、タブ競合ガード無効
- **connecting / reconnecting** 中は入力ブロック（キューしない。reconnecting のみに限定しない）
- reconnecting 中は Task 2 の **ticket 再発行 API** で短命 ticket を取り直してから再接続する
- end／leave 成功後: UI **`idle`**。共有中なら end 後に「公開を更新しますか？」任意（自動 publish しない）
- reconnecting 失敗（120 秒超脱落含む）: UI **`error`**＋再参加導線（`idle` に黙って戻さない）
- `/collab/[token]`: metadata + ヘッダの Referrer-Policy、未ログインはログインのみ
- inventory 交差（Task 0 §4）: 下の RED を **入口ごとに行分け**（1 行要約に潰さない）

- RED（要確認・実装照合前はすべて未完了扱い）:
  - [x] L-060 外し変異 — **CollabControl**: 必須 props（上表。`dialogMouseClickedAtRef` 含む）欠落が型エラーまたはテスト失敗
  - [x] L-060 外し変異 — **PresenceLayer**（Task 5 正本）: `remoteSelections` / `remoteViewports` 省略不可
  - [x] L-060 外し変異 — **MapEditor** 共同編集配線: Control + Presence 必須 props 欠落が失敗
  - [x] L-060 外し変異 — **`/collab/[token]`** 組み立て: Control + Presence 必須 props 欠落が失敗
  - [x] inventory E1 保存: 共同編集中 **拒否**
  - [x] inventory E2 タブ競合: active 中 **無効**
  - [x] inventory E3 学習: 共同編集中 **拒否**
  - [x] inventory E4 プレゼン: 共同編集中 **拒否**
  - [x] inventory E5 音声: 共同編集中 **拒否**
  - [x] inventory E6b publish: active 中 **拒否**（任意確認は end 成功後のみ）
  - [x] inventory E7 コメント: 共同編集中 **拒否**
  - [x] inventory E8 保護モード: 共同編集中 **拒否**
  - [x] inventory E9 マップ切替: 共同編集中 **拒否**
  - [x] inventory E10 アウトライン取込: 共同編集中 **拒否**
  - [x] inventory P36-E5 JSON 読込: 共同編集中 **拒否**
  - [x] inventory P36-E18 パレット MUTATING 単発: 共同編集中 **Yjs経由**
  - [x] inventory P36-E18b パレット MUTATING 一括: 共同編集中 **拒否**
  - [x] inventory P36-AI-N / AI-A: 共同編集中 **拒否**
  - [x] inventory P36-一括: 共同編集中 **拒否**
  - [x] **connecting** 中も入力ブロック（reconnecting のみでない）
  - [x] reconnecting 中も入力ブロック
  - [x] Referrer-Policy 両方
  - [x] L-166 クリア契機（閉鎖・mapId・再試行・error 置換・同一文言・セッション状態変化）
  - [x] Undo が他者操作を消さない
  - [x] reconnecting 失敗／2 分超脱落 → UI **`error`**＋再参加導線（`idle` にしない）
  - [x] leave／end 成功 → UI **`idle`**
  - [x] 参加者一覧の色が awareness と一致

- [x] RED/GREEN: UI 配線（**上記 RED 全項目完了後**に `[x]`。詳細未確認のまま完了マークしない）

---

### Task 5: presence（100）

**Files:** Create presence overlay / awareness bridge

**Interfaces:**
```ts
type RemotePresence = {
  userId: string;
  displayName: string;
  color: string;
  selectedNodeIds: readonly number[];
  /** 無い場合は RemotePresence 自体を作らない／remoteViewports にキーを載せない（null で埋めない） */
  viewportCenter: { x: number; y: number };
};

type PresenceLayerProps = {
  remoteSelections: ReadonlyMap<string, readonly number[]>; // キーあり+[] = 明示的に未選択
  remoteViewports: ReadonlyMap<string, { x: number; y: number }>; // キー無し = 未取得/非共有
};
```

- 選択輪郭色・ビューポート枠。ポインタ軌跡なし
- local viewport 未準備時は local awareness を **publish しない**（`{0,0}` 捏造禁止。設計 §11.1）
- `participantsState: loading`（または error）≠ 空配列 `ready`（未取得を成功の空に倒さない）

- RED:
  - [x] 必須 props（remoteSelections / remoteViewports）
  - [x] Map キー欠落 ≠ 空選択（キーあり+[] のみ明示未選択）
  - [x] awareness 必須フィールド欠落を成功の空に倒さない
  - [x] local viewport 未準備時に local awareness を publish しない
  - [x] `participantsState: loading` を `participants: []` + `ready` に倒さない

- [x] RED/GREEN: presence（**上記 RED 全項目完了後**に `[x]`）

---

### Task 6: edit リンク API

**Files:** Modify share link create validation + ShareDialog

- `permission=edit` 許可（要ログイン発行）
- RED: edit 発行成功、未ログイン発行成功にしない、view/comment 既存契約維持

- [x] RED/GREEN: edit permission

---

### Task 7: docs・ROADMAP

**Files:** ROADMAP.md, features.md, overview.md, setup, `client/.env.example`, browser-test-cases.md

- Phase 39 099・100 完了、現在地更新
- setup / `.env.example`: DO 鍵共有の注記に加え、**イラスト用 Cloudflare 資格情報と共有／共同編集用を分離**すること（設計 §10）
- 手動: 2 ブラウザ同時編集、選択色、**ビューポート枠**、切断再接続（2 分以内／超）、終了後ローカル保存、任意 publish 確認が自動でないこと、view リンクでは編集不可、connecting 中の入力ブロック

- [x] docs 更新（資格情報分離・connecting ブロックを含む注記の反映後に `[x]`）
