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

Cloudflare Workers AI の無料プランには、1 日あたりの利用上限（10,000 Neurons）がある。上限は毎日 0:00 UTC にリセットされる。超過すると、以降の生成はエラーになる。無料プランのままなら、自動では課金されない。1 日に生成できる枚数は限られる。

無料枠の内容は、Cloudflare の都合で変更されうる。最新の内容は、公式の [料金ページ](https://developers.cloudflare.com/workers-ai/platform/pricing/) で確認する。

### 認証情報の扱い

- 認証情報は、サーバー側（Route Handler）だけが環境変数から読む。ブラウザには渡らない。
- `client/.env.local` はコミットしない。`client/.gitignore` の `.env*` で、Git の管理対象から外れている。
