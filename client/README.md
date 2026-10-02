This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## イラスト生成の設定

ノードのイラスト生成は、Cloudflare Workers AI（FLUX.1 schnell）を使う。生成を試すには、次の手順で認証情報を設定する。

1. [Cloudflare](https://dash.cloudflare.com/sign-up) でアカウントを作成する（無料プランで足りる）。
2. ダッシュボードで API トークンを作成する。権限には「Workers AI」を含める。
3. アカウント ID を確認する。ダッシュボードの Workers AI のページなどに表示される。
4. `client/.env.example` を `client/.env.local` にコピーし、`CLOUDFLARE_ACCOUNT_ID` と `CLOUDFLARE_API_TOKEN` に値を設定する。
5. 開発サーバー（`npm run dev`）を再起動する。環境変数は、起動時に読み込まれる。

```bash
cd client
cp .env.example .env.local
# .env.local を編集して、2つの値を設定する
npm run dev
```

### 無料枠について

Cloudflare Workers AI の無料プランには、1 日あたりの利用上限（10,000 Neurons）がある。上限は毎日 0:00 UTC にリセットされる。超過すると、以降の生成はエラーになる。無料プランのままなら、自動では課金されない。

実測では、FLUX.1 schnell（4 ステップ）の 1 枚の生成で、応答の `usage.neurons` が 172.8 Neurons だった（2026-10-03 に測定）。このため、1 日 10,000 Neurons の無料枠で生成できるのは、1 日あたり約 57 枚である。この値は、Cloudflare がモデルや料金を変更すると、変わりうる。

ノードのテキストは、FLUX が日本語を文字として描いてしまうため、先に Cloudflare の翻訳モデルで英語に翻訳してから、画像を生成する。翻訳 1 回の消費は 0.3〜0.5 Neurons 程度で、無視できる（これも実測（2026-10-03）の値で、変わりうる）。翻訳するのは、日本語の文字を含むノードのテキストだけである。また、NSFW フィルターの誤判定は、自動で最大 3 回まで再試行する。拒否されて再試行したリクエストも、無料枠を一部消費する可能性がある（拒否されたリクエストが課金対象かどうかは未確認）。最悪の場合、1 回のクリックで、最大 3 回分を消費しうる。

無料枠の内容は、Cloudflare の都合で変更されうる。最新の内容は、公式の [料金ページ](https://developers.cloudflare.com/workers-ai/platform/pricing/) で確認する。

### 公開時の注意

- イラスト生成の API ルートには、認証・Origin の確認・レート制限がまだない。これらの環境変数を設定したまま、公開環境にデプロイしてはいけない（誰でも 1 日の無料枠を使い切れてしまう）。想定する使い方は、ローカルでの 1 人での開発である。
- Cloudflare のアカウントは、Workers Free プランのものを使う。Workers Paid プランでは、無料枠を超えた分が Neuron 単位で課金される（[料金ページ](https://developers.cloudflare.com/workers-ai/platform/pricing/)）。従量課金を避ける方針に反する。
- ブラウザがリクエストを取り消しても、サーバーは上流への呼び出しを中断しない（翻訳と、最大 3 回の生成が、そのまま無料枠を消費しうる）。ローカルでの 1 人での利用なら、許容できる。
- 公開する場合は、Origin の確認・認証・リクエスト本文のサイズ制限を追加することが前提になる。

### 認証情報の扱い

- 認証情報は、サーバー側（Route Handler）だけが環境変数から読む。ブラウザには渡らない。
- `client/.env.local` はコミットしない。`client/.gitignore` の `.env*` で、Git の管理対象から外れている。
