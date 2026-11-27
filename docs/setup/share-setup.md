# 共有・コメント・共同編集を使えるようにする手順書

このアプリの「共有」（Phase 37。候補094・095）、「ノードコメント」（Phase 38。候補096・097）、および「リアルタイム共同編集」（Phase 39。候補099・100）を動かすために、利用者が行う手順をまとめた文書です。機能仕様は `docs/specifications/features.md` の 39〜41 章、設計は `docs/superpowers/specs/2026-11-26-phase37-share-view-link-design.md`・`docs/superpowers/specs/2026-11-27-phase38-comments-design.md`・`docs/superpowers/specs/2026-11-27-phase39-realtime-collab-design.md` を見てください。共同編集 Worker の詳細はリポジトリルートの `collab-worker/README.md` も参照してください。

## 1. 概要

- **所有者**: Google でログインした人だけが、ローカルのマップをクラウドへ公開したり、閲覧／コメント／編集リンクを発行・失効・再発行したり、共同編集セッションを開始・終了したりできます。未ログインでもローカル編集は従来どおり使えます。
- **閲覧者**: 推測困難な URL（`/share/[token]`）を開くだけで、公開スナップショットを閲覧できます（ログイン不要）。編集・保存・書き出しはできません。
- **コメントリンク（Phase 38）**: 所有者は閲覧リンクとは別に、権限が `comment` の「コメントリンク」を発行できます。コメントリンクを開いた人は、ログインせずにコメントを読めます。投稿・返信・解決・削除には Google でログインします（表示名は Google アカウントの名前）。閲覧リンク（`view`）ではコメントは見えません。コメントはサーバーの D1 に保存し、ローカルのマップ文書には保存しません。
- **編集リンク・共同編集（Phase 39）**: 権限が `edit` のリンク（URL は `/collab/[token]`）を発行できます。参加には Google ログインが必要です。共同編集セッション中だけ Yjs 文書を Cloudflare Durable Object に置き、終了後は所有者の localStorage へ写します。共有の自動 publish はしません。
- **保存先**: メタは Cloudflare D1、文書スナップショットは Cloudflare R2。共有・コメントは Next.js の Route Handler から HTTP API で読み書きします。共同編集の Yjs 同期は `collab-worker/`（Durable Object）への WebSocket です。
- **イラスト生成との分離**: イラスト用の `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` と、共有・共同編集用の `CF_SHARE_*` / `CF_COLLAB_*` は **別名・別資格情報** にしてください。同じトークンの使い回しは避けます。

**秘密はパスワードと同じ扱いです。** 画面共有・チャット・Git のコミット・ログに出さないでください。漏れた可能性があれば、該当するキーや OAuth クライアントの秘密を無効化し、作り直してください。

## 2. 必要なもの

1. Google Cloud の OAuth クライアント（Web アプリケーション）
2. Cloudflare のアカウント、D1 データベース、R2 バケット、API トークン（D1）および R2 用のアクセスキー
3. このアプリのソースと、ターミナル

## 3. Google OAuth（Auth.js）

1. Google Cloud Console でプロジェクトを開き、OAuth 同意画面を設定する（テスト利用者を自分のアカウントに含める）。
2. 「認証情報」から OAuth クライアント ID（種類: Web アプリケーション）を作る。
3. 承認済みのリダイレクト URI に、開発時は例えば次を追加する（ポートは実際の `npm run dev` に合わせる）。

   ```text
   http://localhost:3000/api/auth/callback/google
   ```

4. クライアント ID とクライアント シークレットを控える（値はリポジトリに書かない）。

## 4. Cloudflare D1 / R2

1. Cloudflare ダッシュボードで、共有専用に使う D1 データベースを作成し、Database ID を控える。
2. R2 バケットを作成し、S3 互換のエンドポイント・アクセスキー ID・シークレットアクセスキーを控える。
3. D1 を操作できる API トークンと、Account ID を控える（イラスト用トークンと分けて発行する）。
4. D1 に設計どおりのテーブル（`shared_maps` / `share_revisions` / `share_links`）を用意する。スキーマの正本は設計書 §5.1。
   - **`shared_maps`**: `(owner_user_id, local_map_id)` に **UNIQUE** を付ける（二重共有・孤児リンク防止。アプリ側でも拒否する）。
   - **`owner_user_id`**: Auth.js の Google `sub` をそのまま格納する **不透明な文字列**。Phase 37 では `users` への **FOREIGN KEY は付けない**（OAuth 成功時の D1 `users` upsert も行わない）。`users` テーブルは将来のプロフィール紐付け用の論理枠であり、作成は任意。

### 4.1 Phase 38: コメント用テーブルの追加

コメント機能（Phase 38）を使うには、Phase 37 のテーブルに加えて、コメント用の 2 つのテーブルを D1 に作ります。リポジトリにマイグレーションを実行する仕組みは無いので、Cloudflare ダッシュボードの D1 コンソールで次の SQL を実行します。

- **実行する前に、コンソールで開いているデータベースの名前が共有用の D1 であることを確かめてください。**
- 既存のテーブル（`shared_maps` / `share_revisions` / `share_links`）は変更しません（`share_links` の CHECK 制約だけは、下の 4.2 の手順で確かめます）。
- FOREIGN KEY は Phase 37 と同じく付けません。削除の順番はアプリが守ります。

```sql
CREATE TABLE share_comment_threads (
  id TEXT PRIMARY KEY,
  shared_map_id TEXT NOT NULL,
  node_id INTEGER NOT NULL,
  node_label_snapshot TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_by_user_id TEXT,
  resolved_by_name TEXT,
  resolved_at TEXT,
  CHECK (
    (status = 'open' AND resolved_by_user_id IS NULL AND resolved_by_name IS NULL AND resolved_at IS NULL)
    OR (status = 'resolved' AND resolved_by_user_id IS NOT NULL AND resolved_by_name IS NOT NULL AND resolved_at IS NOT NULL)
  )
);
CREATE INDEX idx_share_comment_threads_map ON share_comment_threads (shared_map_id, created_at);

CREATE TABLE share_comments (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  shared_map_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_share_comments_thread ON share_comments (thread_id, created_at);
CREATE INDEX idx_share_comments_map ON share_comments (shared_map_id);
```

このテーブルを作る前にコメント API を呼ぶと、D1 がエラーを返し（API は 502 `storage-error`）、コメントの一覧は「コメントを読み込めませんでした。」、投稿などの操作は「コメントの操作に失敗しました。」と固定文言で失敗します。マップの閲覧と共有の既存機能は影響を受けません。共有解除は、コメント用テーブルが無いこと（`no such table`）だけを許容して最後まで進みます。

### 4.2 既存の `share_links` の定義を確かめる

Phase 37 には DDL の正本が無かったため、`share_links.permission` に `'comment'` を拒む CHECK 制約（例: `CHECK (permission = 'view')`）を付けている場合があります。その場合、コメントリンクの発行が失敗します（API は 502 `storage-error`）。次の手順で確かめ、必要なら作り直します。

作業中は開発サーバー（アプリ）を止め、共有の操作（共有の開始・更新・リンクの発行・失効・再発行・共有解除）をしないでください。作業中に `share_links` へ書き込まれると、手順 5 の件数が合わなくなったり、行が失われたりします。

1. 作業前に D1 のデータをエクスポートして退避する。Cloudflare 公式の手段（Wrangler の `wrangler d1 export`）を使うか、D1 の Time Travel で戻せる復元点があることを確かめておく（使い方は Cloudflare の公式ドキュメントで確かめる）。
2. 次を実行し、表示された `CREATE TABLE` 文を控える。`permission` に `'comment'` を拒む CHECK が無ければ、ここで終わり（作り直しは不要）。

   ```sql
   SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'share_links';
   ```

3. 次を実行し、インデックスの `CREATE INDEX` 文を控える。

   ```sql
   SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'share_links' AND sql IS NOT NULL;
   ```

4. 手順 2 で控えた文をコピーし、テーブル名を `share_links_new` に、CHECK だけを `CHECK (permission IN ('view', 'comment', 'edit'))` に直して実行する（他の列・制約は変えない。Phase 38 時点で `view`/`comment` だけにしている場合も、Phase 39 では `'edit'` を追加する）。
5. 次を実行し、2 つの `COUNT(*)` が一致することを確かめる。手順 4 の `CREATE TABLE` か、この `INSERT` がエラーになった、または件数が一致しない場合は、`DROP TABLE share_links_new;` で戻して中止する（`share_links` はまだ変えていない）。

   ```sql
   INSERT INTO share_links_new SELECT * FROM share_links;
   SELECT COUNT(*) FROM share_links;
   SELECT COUNT(*) FROM share_links_new;
   ```

6. 古いテーブルを消し、新しいテーブルの名前を戻す。

   ```sql
   DROP TABLE share_links;
   ALTER TABLE share_links_new RENAME TO share_links;
   ```

7. 手順 3 で控えた `CREATE INDEX` 文をそのまま実行して、インデックスを作り直す。
8. 手順 2 の `SELECT` をもう一度実行し、CHECK が `CHECK (permission IN ('view', 'comment', 'edit'))` に直っていることを確かめる。

公式ドキュメントの URL は検索結果や他人のメッセージからたどらず、Cloudflare / Google の公式サイトのトップから進んでください。

### 4.3 Phase 39: 共同編集用テーブルの追加

共同編集（Phase 39）を使うには、次の 2 つのテーブルを共有用の D1 に作ります。リポジトリにマイグレーションを実行する仕組みは無いので、Cloudflare ダッシュボードの D1 コンソールで実行します。

- **実行する前に、コンソールで開いているデータベースの名前が共有用の D1 であることを確かめてください。**
- FOREIGN KEY は付けません。削除の順番はアプリが守ります。

```sql
CREATE TABLE collab_sessions (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  local_map_id TEXT NOT NULL,
  shared_map_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('creating', 'active', 'ended', 'failed')),
  artifact_r2_key TEXT,
  created_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE INDEX idx_collab_sessions_shared_active
  ON collab_sessions (shared_map_id, status, created_at);
CREATE INDEX idx_collab_sessions_owner_local
  ON collab_sessions (owner_user_id, local_map_id, status);

CREATE TABLE collab_participants (
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (session_id, user_id)
);
CREATE INDEX idx_collab_participants_session
  ON collab_participants (session_id, joined_at);
```

### 4.4 Phase 39: Durable Object（`collab-worker/`）と鍵の共有

Yjs の常時接続はリポジトリルートの `collab-worker/`（Cloudflare Worker + Durable Object）が担います。Next.js の CollabAPI と **同じ秘密** を Worker 側にも置く必要があります。

1. `collab-worker` で依存関係を入れ、必要ならデプロイする（手順の詳細は `collab-worker/README.md` と Cloudflare の公式ドキュメント）。

   ```bash
   cd collab-worker
   npm install
   ```

2. Worker に次の秘密を設定する（値はリポジトリ・ログ・画面共有に出さない）。

   | Worker 秘密 | Next（`.env.local`） | 意味 |
   |-------------|----------------------|------|
   | `TICKET_SECRET` | `CF_COLLAB_TICKET_SECRET`（空なら `AUTH_SECRET`） | 参加チケットの署名・検証。**両方で同じ値** |
   | `SERVICE_SECRET` | `CF_COLLAB_SERVICE_SECRET` | Next → Worker 管理 API（seed／export／connections）の共有秘密。**両方で同じ値** |

   ```bash
   npx wrangler secret put TICKET_SECRET
   npx wrangler secret put SERVICE_SECRET
   ```

3. Durable Object のバインディング名は `wrangler.toml` の `COLLAB_ROOM` と揃える（Next の `CF_COLLAB_DO_BINDING` に同じ名前を書く）。
4. ローカル開発では DO のメモリモックまたは `wrangler` ローカルを使えます。実 DO が無い CI はモック契約テストで固定します。
5. 全員切断 TTL 5 分後の成果物退避先を Worker に設定する（本番は推奨。未設定だと DO 破棄後も D1 が `active` のまま残り得る）。

   | Worker 変数 | Next | 意味 |
   |-------------|------|------|
   | `ARTIFACT_EVACUATE_URL` | `https://<app>/api/collab/evacuate` | TTL 退避 POST 先。`Authorization: Bearer SERVICE_SECRET` と `x-collab-session-id`。空 body は拒否（空文書で上書きしない） |

   `CF_COLLAB_TICKET_SECRET` が空のときの `AUTH_SECRET` フォールバックは共有トークン（`CF_SHARE_TOKEN_SECRET`）と同型。ローカル開発用。本番では `CF_COLLAB_TICKET_SECRET` を明示し、Worker の `TICKET_SECRET` と同一値にすること。

## 5. `.env.local` の作り方

値は `client/.env.local` に書きます。見本の変数名は `client/.env.example` と一致させます。

1. `client` ディレクトリで、`.env.local` があるかを確かめます。

   ```bash
   cd client
   test -f .env.local && echo exists
   ```

2. `exists` と出なければ、見本をコピーします。

   ```bash
   cp .env.example .env.local
   ```

   **`exists` と出たら `cp` を実行しないでください**（既存のイラスト／AI 支援のキーを消します）。その場合は `.env.example` の「共有（Phase 37）」および「共同編集（Phase 39）」の節を既存の `.env.local` へ追記します。

3. 次の変数に値を入れます（空欄のままでは共有 API は 503 になります）。

   | 変数 | 意味 |
   |------|------|
   | `AUTH_SECRET` | Auth.js のセッション署名用（十分な長さの乱数） |
   | `AUTH_GOOGLE_ID` | Google OAuth クライアント ID |
   | `AUTH_GOOGLE_SECRET` | Google OAuth クライアント シークレット |
   | `CF_SHARE_ACCOUNT_ID` | Cloudflare Account ID（共有用） |
   | `CF_SHARE_API_TOKEN` | D1 等を叩く API トークン（共有用） |
   | `CF_SHARE_D1_DATABASE_ID` | D1 Database ID |
   | `CF_SHARE_R2_ACCESS_KEY_ID` | R2 アクセスキー ID |
   | `CF_SHARE_R2_SECRET_ACCESS_KEY` | R2 シークレット |
   | `CF_SHARE_R2_BUCKET` | R2 バケット名 |
   | `CF_SHARE_R2_ENDPOINT` | R2 の S3 互換エンドポイント URL |
   | `CF_SHARE_TOKEN_SECRET` | 閲覧トークンの keyed hash 用。**空なら `AUTH_SECRET` を使う** |
   | `CF_SHARE_PUBLIC_ORIGIN` | 共有リンク URL の origin（優先）。無ければ `AUTH_URL` → `NEXT_PUBLIC_APP_URL` → リクエスト origin |

4. 共同編集（Phase 39）を使うときは、続けて次も入れます（名前の見本は `client/.env.example`。値はリポジトリに書かない）。

   | 変数 | 意味 |
   |------|------|
   | `CF_COLLAB_TICKET_SECRET` | 参加チケット署名。**空なら `AUTH_SECRET` を使う**。Worker の `TICKET_SECRET` と同一 |
   | `CF_COLLAB_WS_ORIGIN` | 発行する `wsUrl` の origin 正本（`x-forwarded-host` は使わない） |
   | `CF_COLLAB_DO_BINDING` | Durable Object バインディング名（Worker の `COLLAB_ROOM` と揃える） |
   | `CF_COLLAB_SERVICE_SECRET` | Next → collab-worker 管理 API 用。Worker の `SERVICE_SECRET` と同一 |

5. 開発サーバーを起動し直します（`npm run dev`）。環境変数は起動時に読みます。

注意:

- `.env.local` はコミットしません（`.gitignore` で除外済み）。
- **シェルで同じ名前の変数を `export` していると、`.env.local` より優先されます。**
- イラスト用の `CLOUDFLARE_*` を `CF_SHARE_*` / `CF_COLLAB_*` にコピーして済ませないでください（役割の分離）。
- 平文の edit トークン・参加チケットをログや分析に出さないでください。

## 6. 動作確認の目安

1. アプリを開き、ヘッダー「共有」から「Google でログイン」できる。
2. 「共有を開始」で閲覧 URL が一度だけ表示され、コピーできる。
3. 別のブラウザプロファイル（またはシークレット）でその URL を開き、マップが表示され、編集ボタンが無い。
4. 所有者側で「リンクを失効」すると、同じ URL が 404 相当の固定文言になる。
5. 「リンクを再発行」後は、旧 URL が無効、新 URL だけが有効。

コメント（Phase 38。4.1 のテーブルを作った後）:

1. 共有ダイアログで「コメントリンクを追加」を押すと、権限「コメント可」の URL が一度だけ表示される。
2. 別のブラウザプロファイルでその URL を開くと、右（狭い画面ではマップの下）に「コメント」パネルが出る。ログインしていなくても一覧を読める。
3. 「Google でログイン」してからノードを選ぶと、そのノードへコメントを投稿できる。自分のスレッドは「解決」「再開」でき、自分のコメントは確認のうえ削除できる。
4. 所有者の編集画面では、ヘッダー「コメント」から同じコメントを一覧・投稿・返信・解決・削除でき、未解決のコメントがあるノードの左下に件数のバッジが出る。
5. 閲覧リンク（権限「閲覧」）の URL ではコメントパネルが出ない。
6. コメントリンクを「リンクを再発行」しても、新しいリンクは「コメント可」のまま。
7. 「共有を解除」すると、そのマップのコメントもすべて削除される。

共同編集（Phase 39。4.3・4.4 と `CF_COLLAB_*` を用意したあと）:

1. 所有者がヘッダー「共同編集」からセッションを開始できる（未共有でも可）。
2. 共有ダイアログで「編集リンクを追加」し、別プロファイルで `/collab/[token]` を開き、Google ログイン後に同じマップを同時編集できる。
3. 他参加者の選択色とビューポート枠が見える。
4. 所有者の「終了」後、ローカルに保存され、共有中なら「公開を更新しますか？」が任意（自動では公開されない）。
5. 閲覧リンク（`/share/[token]`）では編集できない。

詳細な手動ケースは `docs/testing/browser-test-cases.md` の AP 節（共有）、AQ 節（コメント）、AR 節（共同編集）です。

## 7. 対象外（見送り）

次は Phase 37 では実装しません（かんばん #64–#69 など。comment 権限は Phase 38、リアルタイム共同編集は Phase 39 で実装）。

- Magic Link / パスワードアカウント / 所有者無ログイン
- Supabase 等の他スタック、クラウドを編集の正本にする運用（常時クラウド正本は [#66](https://scrum-board-jkcejsb6ka-an.a.run.app/items/66?project=5)）
- 招待限定・パスワード付き閲覧リンク、有効期限設定 UI
- 保存のたびの自動公開・ポーリング同期（[#68](https://scrum-board-jkcejsb6ka-an.a.run.app/items/68?project=5)）

次は Phase 38 では実装しません。

- 変更通知・メンション（候補098。[#70](https://scrum-board-jkcejsb6ka-an.a.run.app/items/70?project=5)）
- コメントのローカル保存・書き出し（[#71](https://scrum-board-jkcejsb6ka-an.a.run.app/items/71?project=5)）
- コメントの編集・入れ子の返信・リアクション・添付・Markdown 描画（[#72](https://scrum-board-jkcejsb6ka-an.a.run.app/items/72?project=5)）
- 閲覧リンク（view）でのコメント閲覧（[#73](https://scrum-board-jkcejsb6ka-an.a.run.app/items/73?project=5)）
- 未ログイン（匿名）でのコメント投稿（[#74](https://scrum-board-jkcejsb6ka-an.a.run.app/items/74?project=5)）
- コメントからコメント先ノードへの移動（[#75](https://scrum-board-jkcejsb6ka-an.a.run.app/items/75?project=5)）
- コメント先ノード ID の再利用の検出（[#76](https://scrum-board-jkcejsb6ka-an.a.run.app/items/76?project=5)）
- コメントの監査ログ・削除の取り消し（[#77](https://scrum-board-jkcejsb6ka-an.a.run.app/items/77?project=5)）
- コメントのリアルタイム更新・ポーリング（[#68](https://scrum-board-jkcejsb6ka-an.a.run.app/items/68?project=5) / [#83](https://scrum-board-jkcejsb6ka-an.a.run.app/items/83?project=5)）

次は Phase 39 では実装しません。

- 常時クラウド正本化（[#66](https://scrum-board-jkcejsb6ka-an.a.run.app/items/66?project=5)）
- 保存のたび自動公開・ポーリング（[#68](https://scrum-board-jkcejsb6ka-an.a.run.app/items/68?project=5)）
- 長時間オフラインの完全マージ（[#78](https://scrum-board-jkcejsb6ka-an.a.run.app/items/78?project=5)）
- 音声の同時編集チャネル（[#79](https://scrum-board-jkcejsb6ka-an.a.run.app/items/79?project=5)）
- モバイル専用 UI（[#80](https://scrum-board-jkcejsb6ka-an.a.run.app/items/80?project=5)）
- 共同編集の監査ログ（[#81](https://scrum-board-jkcejsb6ka-an.a.run.app/items/81?project=5)）
- エンドツーエンド暗号（[#82](https://scrum-board-jkcejsb6ka-an.a.run.app/items/82?project=5)）
- コメントのリアルタイム同期（[#83](https://scrum-board-jkcejsb6ka-an.a.run.app/items/83?project=5)）
