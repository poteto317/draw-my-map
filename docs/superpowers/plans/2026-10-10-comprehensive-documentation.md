# 包括的ドキュメント整備 実装計画

現在の実装（Phase 0 〜 Phase 7）において、ドキュメントとして整理されていない仕様・設計・ガイドライン・API仕様・スキーマを網羅的に洗い出し、開発者および利用者がシステムの全容を理解できるようにドキュメントとして整備する。

## 目標

1. リポジトリルートに存在しない包括的な `README.md` を作成する。
2. Next.js のデフォルトボイラープレートのままである `client/README.md` を、Draw My Map クライアント固有の開発ガイドとして刷新する。
3. `docs/` 配下に全体のインデックス（ポータル）となる `docs/README.md` を作成する。
4. 全体アーキテクチャ（Pixi.js と React の協調モデル、レイヤードアーキテクチャ、SRP原則）を解説した `docs/architecture/overview.md` を作成する。
5. 実装されている全機能（Phase 0〜7）とユーザー操作（ショートカット一覧等）を網羅した `docs/specifications/features.md` を作成する。
6. `MapDocument` スキーマ（Version 1/2/3）、後方互換性、localStorage 永続化仕様をまとめた `docs/specifications/data-model.md` を作成する。
7. イラスト生成 Route Handler (`POST /api/illustrations`) の仕様をまとめた `docs/specifications/api.md` を作成する。

## Global Constraints

- 言語: すべてのドキュメント、コミットメッセージ、レビューコメント等は日本語で記述する（技術用語・コマンド・識別子は英語可）。
- 既存のコードや機能は破壊せず、ドキュメントの記述は実際の実装（コード・テスト）と厳密に一致させる。
- ドキュメント内のファイルリンクや参照は正確に記述する。
- 変更完了後、`client` ディレクトリで `npm run verify` が成功することを確認する。

---

## タスク一覧

### タスク 1: リポジトリルート `README.md` および ドキュメントポータル `docs/README.md` の作成
- リポジトリルートに `README.md` を新規作成する。
  - プロジェクト概要（Draw My Map のビジョンと特徴）
  - 主要機能のサマリー（ツリー編集、自動レイアウト、解像度フィルタリング、AIイラスト生成、エクスポート/インポート）
  - 技術スタック（Next.js 15, React 19, Pixi.js, Tailwind CSS, TypeScript, Cloudflare Workers AI）
  - クイックスタート手順
  - ディレクトリ構成概要
  - ドキュメントへのナビゲーションリンク
- `docs/README.md` を新規作成する。
  - `docs/` 配下の構造（仕様書、アーキテクチャ、セットアップ、テスト、過去の計画/設計）の案内とリンク集

### タスク 2: `client/README.md` の刷新
- `client/README.md` をプロジェクト固有の内容に刷新する。
  - Next.js ボイラープレートを整理し、Draw My Map クライアントの目的・構成を明記
  - 開発用コマンド一覧（`dev`, `build`, `lint`, `typecheck`, `test`, `verify`, `tailwind:scan`）
  - 環境変数の設定（`.env.local` と Cloudflare 設定）
  - ディレクトリ構造と責務
  - イラスト生成セットアップへのリンク

### タスク 3: システムアーキテクチャ設計書 `docs/architecture/overview.md` の作成
- `docs/architecture/overview.md` を新規作成する。
  - レイヤードアーキテクチャ（Domain, Services, Hooks, Components, Server, Config, Types）の責務と依存ルール
  - Pixi.js (2D WebGL/Canvas) と React 19 (DOM) の協調設計（Pixi Application ライフサイクル、シーンツリー描画、ビューポート変換、可視性トランジション、DOM オーバーレイ UI とのイベントハンドリング）
  - 状態管理と単一責任原則 (SRP) の設計方針
  - モジュール構成図・データフロー図（Mermaid）

### タスク 4: 全機能仕様・操作マニュアル `docs/specifications/features.md` の作成
- `docs/specifications/features.md` を新規作成する。
  - キャンバス操作（パン、ズーム、フォーカス）
  - ノード基本操作（作成、編集、削除、移動、子孫連動移動、既存ノード接続）
  - 自動レイアウト（フォレスト・ツリーアルゴリズム、重なり回避、手動/自動トグル）
  - 解像度フィルタリング（重要度タグ、ズーム連動自動判定とヒステリシス、手動フィルタ、フェード表示）
  - データ永続化・エクスポート（localStorage自動保存、JSONインポート/エクスポート、PNG/SVGエクスポート）
  - AIイラスト生成（プロンプト生成、Cloudflare連携、ノード紐付け、縮小、再生成、削除）
  - 操作方法・キーボードショートカット一覧表

### タスク 5: データモデル・永続化仕様書 `docs/specifications/data-model.md` の作成
- `docs/specifications/data-model.md` を新規作成する。
  - ノードモデル型定義 (`Node`, `NodeImportance`, `NodeLayoutMode`, `ResolutionLevel`)
  - `MapDocument` JSON スキーマ（Version 1, 2, 3 の詳細仕様、差分）
  - マイグレーションと後方互換性仕様（正規化デコーダーの挙動、デフォルト値補完）
  - localStorage 保存仕様（キー名、保存トリガー、クォータ超過エラーハンドリング）

### タスク 6: イラスト生成 API 仕様書 `docs/specifications/api.md` の作成
- `docs/specifications/api.md` を新規作成する。
  - エンドポイント: `POST /api/illustrations`
  - リクエスト・レスポンスフォーマット（JSON スキーマ、ステータスコード）
  - 内部処理パイプライン（入力検証 → 日本語判定・英訳 `@cf/meta/m2m100-1.2b` → プロンプト生成 → 画像生成 `@cf/black-forest-labs/flux-1-schnell` → NSFW誤判定時の最大3回再試行）
  - エラー仕様（400, 422, 429, 502, 503）
  - 本番運用時の課題・推奨事項（認証、レート制限、Origin確認）

### タスク 7: 未整理箇所の探索・記載ループ（3回連続未検出まで継続）
- コードベース全体（`client/src/` の全モジュール、設定、テスト、スクリプト）と全ドキュメント（`README.md`, `client/README.md`, `docs/` 配下すべて, `ROADMAP.md`）を突き合わせ、ドキュメント化されていない実装仕様・定数・エッジケース・不整合を探索する。
- **ループ条件**:
  1. 監査サブエージェントにより、未整理の実装仕様や既存ドキュメントとの乖離・不足箇所を洗い出す。
  2. 変更すべき箇所が見つかった場合:
     - 連続未検出カウントを `0` にリセットする。
     - 実装サブエージェントで該当ドキュメントへ記載・修正を行う。
     - レビュアーサブエージェントで二段階レビュー（仕様適合・品質/実装整合性）を行い、指摘があれば修正・再レビューして承認を得る。
     - 次のイテレーションへ進む。
  3. 変更すべき箇所が 0 件だった場合:
     - 連続未検出カウントを `+1` する。
     - 3 回連続で変更箇所が見つからなかった場合（カウント = 3）、ループを完了とする。

### タスク 8: 全体検証とコミット
- `ROADMAP.md` の最終更新日・現在地を確認・更新する。
- `client` ディレクトリで `npm run verify` を実行し、全テスト・型チェック・ビルドが成功することを確認する。
- 差分を確認し、Conventional Commits 形式でコミットする。
