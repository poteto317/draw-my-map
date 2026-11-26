# 共有（閲覧専用リンク）を使えるようにする手順書

このアプリの「共有」（Phase 37。候補094・095）を動かすために、利用者が行う手順をまとめた文書です。機能仕様は `docs/specifications/features.md` の 39 章、設計は `docs/superpowers/specs/2026-11-26-phase37-share-view-link-design.md` を見てください。

## 1. 概要

- **所有者**: Google でログインした人だけが、ローカルのマップをクラウドへ公開したり、閲覧リンクを発行・失効・再発行したりできます。未ログインでもローカル編集は従来どおり使えます。
- **閲覧者**: 推測困難な URL（`/share/[token]`）を開くだけで、公開スナップショットを閲覧できます（ログイン不要）。編集・保存・書き出しはできません。
- **保存先**: メタは Cloudflare D1、文書スナップショットは Cloudflare R2。Next.js の Route Handler から HTTP API で読み書きします（Workers バインディング専用デプロイはしません）。
- **イラスト生成との分離**: イラスト用の `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` と、共有用の `CF_SHARE_*` は **別名・別資格情報** にしてください。同じトークンの使い回しは避けます。

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

公式ドキュメントの URL は検索結果や他人のメッセージからたどらず、Cloudflare / Google の公式サイトのトップから進んでください。

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

   **`exists` と出たら `cp` を実行しないでください**（既存のイラスト／AI 支援のキーを消します）。その場合は `.env.example` の「共有（Phase 37）」の節を既存の `.env.local` へ追記します。

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

4. 開発サーバーを起動し直します（`npm run dev`）。環境変数は起動時に読みます。

注意:

- `.env.local` はコミットしません（`.gitignore` で除外済み）。
- **シェルで同じ名前の変数を `export` していると、`.env.local` より優先されます。**
- イラスト用の `CLOUDFLARE_*` を `CF_SHARE_*` にコピーして済ませないでください（役割の分離）。

## 6. 動作確認の目安

1. アプリを開き、ヘッダー「共有」から「Google でログイン」できる。
2. 「共有を開始」で閲覧 URL が一度だけ表示され、コピーできる。
3. 別のブラウザプロファイル（またはシークレット）でその URL を開き、マップが表示され、編集ボタンが無い。
4. 所有者側で「リンクを失効」すると、同じ URL が 404 相当の固定文言になる。
5. 「リンクを再発行」後は、旧 URL が無効、新 URL だけが有効。

詳細な手動ケースは `docs/testing/browser-test-cases.md` の AP 節です。

## 7. 対象外（見送り）

次は Phase 37 では実装しません（かんばん #64–#69 など）。

- Magic Link / パスワードアカウント / 所有者無ログイン
- Supabase 等の他スタック、クラウドを編集の正本にする運用
- 招待限定・パスワード付き閲覧リンク、有効期限設定 UI
- 保存のたびの自動公開・ポーリング同期・リアルタイム共同編集
- comment 権限・コメント UI
