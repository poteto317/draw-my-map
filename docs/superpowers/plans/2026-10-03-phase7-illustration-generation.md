# Phase 7 AIイラスト生成（画像生成API連携） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. インライン実行（`superpowers:executing-plans`）は使わない（`AGENTS.md`参照）。作業は、通常のブランチ上（このプランの作成時点で`phase7-illustration-generation`）で行い、`git worktree`は使わない（ユーザー指示）。

**Goal:** ノードのテキストをもとに、画像生成APIでイラストを生成し、右パネルにプレビュー表示できるようにする。右クリックメニューと右パネルのボタンの、どちらからでも同じ生成の入口を通る。

**Architecture:** ブラウザは、自分のサーバー（Next.jsのRoute Handler `POST /api/illustrations`）だけを呼ぶ。サーバーが、環境変数のAPIキーで、Cloudflare Workers AIの画像生成（FLUX.1 schnell）を呼び、画像（base64）を返す。判定・変換は純粋関数、外部呼び出しは注入可能な小さなモジュールに分け、テストは偽の`fetch`だけで行う（実APIは呼ばない）。生成の入口`useIllustrationGeneration`は、状態（生成中・成功・失敗）を持ち、生成中の再要求を無視する。生成した画像を、ノードへ紐付けて保存する処理は、次の項目（ROADMAP Phase 7の4項目目）で行い、本計画では、右パネルのプレビュー表示（保存しない）までを範囲とする。

**Tech Stack:** TypeScript 5、React 19、Next.js 16（Route Handler）、Jest 30、Testing Library、Cloudflare Workers AI REST API（`@cf/black-forest-labs/flux-1-schnell`）

## 提供元の選定（調査結果）

ユーザー要望: 従量課金ではないもの。公式ドキュメントで確認した結果（2026-10-03時点）は次のとおり。

| 候補 | 結果 |
|---|---|
| **Cloudflare Workers AI（FLUX.1 schnell）** | **採用。** 無料プランで、1日10,000 Neuronsまで無料。「超過すると、以降の操作はエラーになる」（無料プランでは自動課金されない。それ以上は、有料プランへの申し込みが必要）。FLUX.1 schnellは無料プランで使える。リセットは毎日 00:00 UTC |
| Google Gemini API（画像モデル） | 不採用。公式の料金表で、画像生成モデルはすべて無料枠が「Not available」（有料のみ）。複数のブログにある「1日500枚が無料」は、公式と食い違う |
| Hugging Face Inference Providers | 不採用。無料ユーザーの無料枠は月$0.10と、実用には少なく、超過は従量課金 |
| Pollinations など、キー不要の公開API | 不採用。公式の利用条件・制限・継続性を確認できなかった |

参照: Cloudflare Workers AI の料金と制限（https://developers.cloudflare.com/workers-ai/platform/pricing/）、FLUX.1 schnell のAPI仕様（https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/）、Gemini API の料金（https://ai.google.dev/gemini-api/docs/pricing）。

**実装時に確認が必要な点（公式ページで確認し、結果をタスクの報告に書く）**
- FLUX.1 schnellのREST APIの`seed`の型（公式ページでは「string、必須、ランダムな正の整数」と記載。スキーマの型に合わせる）。
- 1回の生成で消費するNeuronsの目安と、1日に生成できる枚数（目安として、数十〜数百枚/日）。
- 無料枠を超えたときの、エラーのHTTPステータスとエラーコード（`429`以外の場合は、Task 2の対応づけを調整する）。

**利用者が行う準備（エージェントはできない）**
1. Cloudflareのアカウントを作成する（無料プランで足りる）。
2. 「Workers AI」の権限を持つAPIトークンを作成する。
3. アカウントIDとAPIトークンを、`client/.env.local`（コミットしない）に設定する（Task 7の`.env.example`と`README`に手順を書く）。
4. 実装後、実際のAPIでの動作確認は、利用者が行う（テストは、偽の`fetch`で、実APIを呼ばない）。

## Global Constraints

- 範囲はROADMAP Phase 7の3項目目「ノードのテキストをもとにAI（画像生成API）でイラストを生成」のみ。生成したイラストを、ノードへ紐付けて保存・永続化することは含めない（4項目目）。イラストの再生成・削除も含めない（5項目目）。
- ブラウザに、APIキー・アカウントIDを渡さない。サーバーのコードだけが、`process.env`から読む。エラーメッセージ・ログ・レスポンスに、APIトークンを含めない。
- ノードのラベルの検証: 前後の空白を除いたラベルが、1文字以上、`200`文字以下（`ILLUSTRATION_LABEL_MAX_LENGTH`）。ブラウザ側とサーバー側の両方で検証する。
- 画像生成のプロンプトは、英語のテンプレートに、ラベルを埋め込む（FLUX.1は英語のプロンプトに強い）。ラベルは、サーバー側でも検証したうえで使う。
- 生成の入口（`generateIllustration(nodeId)`）は、右クリックメニュー（`MapStage`の`onGenerateIllustration`）と、右パネルのボタンの両方が共有する。生成中の再要求は、無視する（二重実行の防止）。
- 生成の状態（生成中・成功・失敗）と、生成した画像は、メモリだけに持つ。保存形式（V2 JSON、localStorage）、`Node`型、Storageキーは、変更しない。
- テストでは、実際のネットワーク呼び出しを行わない。サーバー側のテストには、ファイル先頭に`/** @jest-environment node */`を書く（`Request`/`Response`/`fetch`を使うため）。
- 新しい外部依存を追加しない。
- UI文言・コメント・テスト名は日本語、識別子は英語。
- 実装コードより先に対応テストを追加し、REDを確認する。
- `client`変更後は`client`ディレクトリで`npm run verify`を実行する。
- 最後のタスクで、`ROADMAP.md`を更新する（実装済み項目だけを完了にする）。

## File Structure

- Create: `client/src/domain/illustration/illustrationPrompt.ts` — ラベルの検証とプロンプトの組み立て（純粋関数）
- Create: `client/src/server/illustration/cloudflareImageGenerator.ts` — Cloudflare呼び出し、設定の読み取り、エラーの分類
- Create: `client/src/server/illustration/handleIllustrationRequest.ts` — リクエストの検証、設定の確認、生成、レスポンスの組み立て
- Create: `client/src/app/api/illustrations/route.ts` — Route Handler（配線だけ）
- Create: `client/src/services/illustration/illustrationClient.ts` — ブラウザからAPIを呼ぶ、エラーの分類、利用者向けメッセージ
- Modify: `client/src/hooks/useIllustrationGeneration.ts` — 状態を持つ生成の入口
- Modify: `client/src/components/layout/IllustrationPanel.tsx`、`client/src/app/page.tsx` — 生成の状態の表示と配線
- Create: `client/.env.example`、Modify: `client/README.md`、`ROADMAP.md`
- Create tests: 各モジュールの`__tests__/`（各タスクに記載）

---

### Task 1: ラベルの検証とプロンプトの組み立て

**Files:**
- Create: `client/src/domain/illustration/illustrationPrompt.ts`
- Test: `client/src/domain/illustration/__tests__/illustrationPrompt.test.ts`

**Interfaces:**
- Produces:
  - `ILLUSTRATION_LABEL_MAX_LENGTH = 200`
  - `type IllustrationLabelValidation = { ok: true; label: string } | { ok: false; reason: "empty" | "too-long" }`
  - `validateIllustrationLabel(label: string): IllustrationLabelValidation` — 前後の空白を除いた値で判定し、`ok: true`のときは、除いた後の値を返す。
  - `buildIllustrationPrompt(label: string): string`

- [ ] **Step 1: 失敗するテストを書く**

```ts
import {
  ILLUSTRATION_LABEL_MAX_LENGTH,
  buildIllustrationPrompt,
  validateIllustrationLabel,
} from "@/domain/illustration/illustrationPrompt";

describe("validateIllustrationLabel", () => {
  it("前後の空白を除いたラベルを返す", () => {
    expect(validateIllustrationLabel("  企画の背景  ")).toEqual({ ok: true, label: "企画の背景" });
  });

  it("空文字と空白だけのラベルは empty", () => {
    expect(validateIllustrationLabel("")).toEqual({ ok: false, reason: "empty" });
    expect(validateIllustrationLabel("   \n ")).toEqual({ ok: false, reason: "empty" });
  });

  it("上限ちょうどの長さは受け付ける", () => {
    const label = "あ".repeat(ILLUSTRATION_LABEL_MAX_LENGTH);
    expect(validateIllustrationLabel(label)).toEqual({ ok: true, label });
  });

  it("上限を超える長さは too-long", () => {
    const label = "あ".repeat(ILLUSTRATION_LABEL_MAX_LENGTH + 1);
    expect(validateIllustrationLabel(label)).toEqual({ ok: false, reason: "too-long" });
  });

  it("空白を除いた後の長さで上限を判定する", () => {
    const label = ` ${"あ".repeat(ILLUSTRATION_LABEL_MAX_LENGTH)} `;
    expect(validateIllustrationLabel(label)).toMatchObject({ ok: true });
  });
});

describe("buildIllustrationPrompt", () => {
  it("ラベルを含み、文字を描かない指示を含む英語のプロンプトを返す", () => {
    const prompt = buildIllustrationPrompt("企画の背景");

    expect(prompt).toContain("企画の背景");
    expect(prompt).toContain("no text");
    expect(prompt).toContain("white background");
  });

  it("上限の長さのラベルでも、APIの上限（2048文字）に収まる", () => {
    const prompt = buildIllustrationPrompt("あ".repeat(ILLUSTRATION_LABEL_MAX_LENGTH));

    expect(prompt.length).toBeLessThanOrEqual(2048);
  });
});
```

- [ ] **Step 2: 失敗確認**

Run: `cd client && npx jest src/domain/illustration/__tests__/illustrationPrompt.test.ts`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装**

```ts
export const ILLUSTRATION_LABEL_MAX_LENGTH = 200;

export type IllustrationLabelValidation =
  | { ok: true; label: string }
  | { ok: false; reason: "empty" | "too-long" };

export function validateIllustrationLabel(label: string): IllustrationLabelValidation {
  const trimmed = label.trim();
  if (trimmed === "") return { ok: false, reason: "empty" };
  if (trimmed.length > ILLUSTRATION_LABEL_MAX_LENGTH) return { ok: false, reason: "too-long" };
  return { ok: true, label: trimmed };
}

export function buildIllustrationPrompt(label: string): string {
  return `A simple, clear flat-design illustration that represents the concept "${label}", centered subject, plain white background, no text, no letters`;
}
```

- [ ] **Step 4: 成功確認**

Run: `cd client && npx jest src/domain/illustration && npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/domain/illustration
git commit -m "feat(illustration): ラベルの検証とプロンプトの組み立てを追加"
```

（コミットメッセージの末尾に、リポジトリで指定された`Co-Authored-By`の行を付ける。以降のタスクも同様。）

---

### Task 2: Cloudflare画像生成クライアント（サーバー側）

**Files:**
- Create: `client/src/server/illustration/cloudflareImageGenerator.ts`
- Test: `client/src/server/illustration/__tests__/cloudflareImageGenerator.test.ts`

**Interfaces:**
- Produces:
  - `type GeneratedImage = { base64: string; mimeType: "image/jpeg" }`
  - `type ImageGenerator = (prompt: string) => Promise<GeneratedImage>`
  - `type ImageGenerationErrorKind = "quota-exceeded" | "upstream-error"`
  - `class ImageGenerationError extends Error { readonly kind: ImageGenerationErrorKind }`
  - `type CloudflareConfig = { accountId: string; apiToken: string }`
  - `readCloudflareConfig(env: Record<string, string | undefined>): CloudflareConfig | null` — `CLOUDFLARE_ACCOUNT_ID`と`CLOUDFLARE_API_TOKEN`の両方が、空でない文字列のときだけ返す。
  - `createCloudflareImageGenerator(config: CloudflareConfig, fetchImpl?: typeof fetch): ImageGenerator`

仕様:
- リクエスト: `POST https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`、ヘッダー`Authorization: Bearer ${apiToken}`と`Content-Type: application/json`、本文`{ prompt, steps: 4, seed }`（`seed`は、ランダムな正の整数。型は、公式ページのスキーマに合わせる）。【訂正】実際の API は `seed` を HTTP 400（code 5006）で拒否するため、本文は`{ prompt, steps: 4 }`とする。
- 成功: HTTP 2xxで、`json.success === true`、かつ`typeof json.result?.image === "string"`のとき、`{ base64: json.result.image, mimeType: "image/jpeg" }`を返す。
- 失敗の分類: HTTP `429`、または、エラーのメッセージが無料枠の超過を示すとき（`/neuron|allocation|quota|limit/i`）は`quota-exceeded`。それ以外の失敗（HTTPエラー、`success: false`、画像が無い、`fetch`の例外）は、すべて`upstream-error`。
- エラーのメッセージ（`Error.message`）に、APIトークンを含めない。

- [ ] **Step 1: 失敗するテストを書く**（ファイル先頭に`/** @jest-environment node */`）

```ts
/** @jest-environment node */
import {
  ImageGenerationError,
  createCloudflareImageGenerator,
  readCloudflareConfig,
} from "@/server/illustration/cloudflareImageGenerator";

const config = { accountId: "acct-123", apiToken: "secret-token-xyz" };

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("readCloudflareConfig", () => {
  it("2つの環境変数が揃っていれば設定を返す", () => {
    expect(readCloudflareConfig({
      CLOUDFLARE_ACCOUNT_ID: "acct-123",
      CLOUDFLARE_API_TOKEN: "secret-token-xyz",
    })).toEqual(config);
  });

  it.each([
    [{}],
    [{ CLOUDFLARE_ACCOUNT_ID: "acct-123" }],
    [{ CLOUDFLARE_API_TOKEN: "secret-token-xyz" }],
    [{ CLOUDFLARE_ACCOUNT_ID: "", CLOUDFLARE_API_TOKEN: "secret-token-xyz" }],
    [{ CLOUDFLARE_ACCOUNT_ID: "acct-123", CLOUDFLARE_API_TOKEN: "   " }],
  ])("不足・空の場合は null を返す", (env) => {
    expect(readCloudflareConfig(env)).toBeNull();
  });
});

describe("createCloudflareImageGenerator", () => {
  it("正しいURL・認証ヘッダー・本文でPOSTし、画像を返す", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({ success: true, result: { image: "BASE64DATA" }, errors: [] }),
    );

    const image = await createCloudflareImageGenerator(config, fetchImpl)("a prompt");

    expect(image).toEqual({ base64: "BASE64DATA", mimeType: "image/jpeg" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct-123/ai/run/@cf/black-forest-labs/flux-1-schnell",
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer secret-token-xyz",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body)).toMatchObject({ prompt: "a prompt", steps: 4 });
  });

  it("HTTP 429 は quota-exceeded", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({ success: false, errors: [{ code: 1, message: "rate" }] }, { status: 429 }),
    );

    await expect(createCloudflareImageGenerator(config, fetchImpl)("p")).rejects.toMatchObject({
      name: "ImageGenerationError",
      kind: "quota-exceeded",
    });
  });

  it("無料枠の超過を示すメッセージは quota-exceeded", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse(
        { success: false, errors: [{ code: 4006, message: "daily free allocation of neurons used up" }] },
        { status: 400 },
      ),
    );

    await expect(createCloudflareImageGenerator(config, fetchImpl)("p")).rejects.toMatchObject({
      kind: "quota-exceeded",
    });
  });

  it("HTTP 500 は upstream-error", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({ success: false, errors: [{ code: 9, message: "boom" }] }, { status: 500 }),
    );

    await expect(createCloudflareImageGenerator(config, fetchImpl)("p")).rejects.toMatchObject({
      kind: "upstream-error",
    });
  });

  it("success が false なら upstream-error", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({ success: false, result: { image: "X" }, errors: [] }),
    );

    await expect(createCloudflareImageGenerator(config, fetchImpl)("p")).rejects.toMatchObject({
      kind: "upstream-error",
    });
  });

  it("画像が含まれない応答は upstream-error", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ success: true, result: {} }));

    await expect(createCloudflareImageGenerator(config, fetchImpl)("p")).rejects.toBeInstanceOf(
      ImageGenerationError,
    );
  });

  it("JSONでない応答は upstream-error", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response("<html>bad gateway</html>", { status: 502 }));

    await expect(createCloudflareImageGenerator(config, fetchImpl)("p")).rejects.toMatchObject({
      kind: "upstream-error",
    });
  });

  it("fetch が例外を投げたら upstream-error", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error("network down"));

    await expect(createCloudflareImageGenerator(config, fetchImpl)("p")).rejects.toMatchObject({
      kind: "upstream-error",
    });
  });

  it("エラーのメッセージにAPIトークンを含めない", async () => {
    const failures = [
      jest.fn().mockResolvedValue(jsonResponse({ success: false, errors: [{ message: "x" }] }, { status: 500 })),
      jest.fn().mockRejectedValue(new Error("failed with Bearer secret-token-xyz")),
    ];

    for (const fetchImpl of failures) {
      const error = await createCloudflareImageGenerator(config, fetchImpl)("p").catch((e) => e);
      expect(String(error.message)).not.toContain("secret-token-xyz");
    }
  });
});
```

注意: 最後のテストの2つ目（`fetch`の例外のメッセージにトークンが含まれる場合）が成り立つよう、`fetch`が投げた例外は、メッセージをそのまま転記せず、固定の文言（例: 「画像生成の呼び出しに失敗しました」）で`ImageGenerationError`を作る。

- [ ] **Step 2: 失敗確認**

Run: `cd client && npx jest src/server/illustration/__tests__/cloudflareImageGenerator.test.ts`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装**

```ts
export type GeneratedImage = { base64: string; mimeType: "image/jpeg" };
export type ImageGenerator = (prompt: string) => Promise<GeneratedImage>;
export type ImageGenerationErrorKind = "quota-exceeded" | "upstream-error";
export type CloudflareConfig = { accountId: string; apiToken: string };

export class ImageGenerationError extends Error {
  readonly kind: ImageGenerationErrorKind;

  constructor(kind: ImageGenerationErrorKind, message: string) {
    super(message);
    this.name = "ImageGenerationError";
    this.kind = kind;
  }
}

const QUOTA_MESSAGE_PATTERN = /neuron|allocation|quota|limit/i;

export function readCloudflareConfig(
  env: Record<string, string | undefined>,
): CloudflareConfig | null {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = env.CLOUDFLARE_API_TOKEN?.trim();
  return accountId && apiToken ? { accountId, apiToken } : null;
}

type CloudflareResponseBody = {
  success?: boolean;
  result?: { image?: unknown };
  errors?: Array<{ message?: unknown }>;
};

function firstErrorMessage(body: CloudflareResponseBody | null): string {
  const message = body?.errors?.[0]?.message;
  return typeof message === "string" ? message : "";
}

export function createCloudflareImageGenerator(
  config: CloudflareConfig,
  fetchImpl: typeof fetch = fetch,
): ImageGenerator {
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`;

  return async (prompt) => {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt, steps: 4, seed: Math.floor(Math.random() * 2_000_000_000) + 1 }),
      });
    } catch {
      throw new ImageGenerationError("upstream-error", "画像生成の呼び出しに失敗しました");
    }

    const body = (await response.json().catch(() => null)) as CloudflareResponseBody | null;
    const errorMessage = firstErrorMessage(body);

    if (response.status === 429 || (!response.ok && QUOTA_MESSAGE_PATTERN.test(errorMessage))) {
      throw new ImageGenerationError("quota-exceeded", "画像生成の無料枠を使い切りました");
    }
    if (!response.ok || body?.success !== true || typeof body.result?.image !== "string") {
      throw new ImageGenerationError("upstream-error", "画像生成の応答が不正です");
    }
    return { base64: body.result.image, mimeType: "image/jpeg" };
  };
}
```

`seed`の型は、実装時に、公式のスキーマ（`seed`が文字列か整数か）を確認し、必要なら`String(...)`にする。テストの`toMatchObject({ prompt, steps: 4 })`は、`seed`の型に依存しない。

- [ ] **Step 4: 成功確認**

Run: `cd client && npx jest src/server/illustration/__tests__/cloudflareImageGenerator.test.ts && npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/server/illustration/cloudflareImageGenerator.ts client/src/server/illustration/__tests__/cloudflareImageGenerator.test.ts
git commit -m "feat(illustration): Cloudflare画像生成のクライアントを追加"
```

---

### Task 3: リクエスト処理とRoute Handler

**Files:**
- Create: `client/src/server/illustration/handleIllustrationRequest.ts`
- Create: `client/src/app/api/illustrations/route.ts`
- Test: `client/src/server/illustration/__tests__/handleIllustrationRequest.test.ts`
- Test: `client/src/app/api/illustrations/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `validateIllustrationLabel`、`buildIllustrationPrompt`（Task 1）、`readCloudflareConfig`、`ImageGenerationError`、`ImageGenerator`、`CloudflareConfig`（Task 2）
- Produces:
  - `type IllustrationRouteDeps = { env: Record<string, string | undefined>; createGenerator: (config: CloudflareConfig) => ImageGenerator }`
  - `handleIllustrationRequest(request: Request, deps: IllustrationRouteDeps): Promise<Response>`
  - レスポンス（JSON）: 成功`200 { image: string, mimeType: "image/jpeg" }`。失敗`{ error: "invalid-request" | "invalid-label" | "not-configured" | "quota-exceeded" | "upstream-error" }`で、ステータスは順に`400`、`400`、`503`、`429`、`502`。
  - 判定の順序: 本文の解析と型 → ラベルの検証 → 設定の確認 → 生成。

- [ ] **Step 1: 失敗するテストを書く**

`handleIllustrationRequest.test.ts`（先頭に`/** @jest-environment node */`）:

```ts
/** @jest-environment node */
import { ImageGenerationError } from "@/server/illustration/cloudflareImageGenerator";
import { handleIllustrationRequest } from "@/server/illustration/handleIllustrationRequest";

const env = { CLOUDFLARE_ACCOUNT_ID: "acct", CLOUDFLARE_API_TOKEN: "token" };

function post(body: unknown, raw = false): Request {
  return new Request("http://localhost/api/illustrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

function deps(generate = jest.fn().mockResolvedValue({ base64: "IMG", mimeType: "image/jpeg" })) {
  return { deps: { env, createGenerator: jest.fn().mockReturnValue(generate) }, generate };
}

describe("handleIllustrationRequest", () => {
  it("正常なラベルで画像を返し、プロンプトにラベルを含める", async () => {
    const { deps: d, generate } = deps();

    const response = await handleIllustrationRequest(post({ label: "  企画の背景 " }), d);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ image: "IMG", mimeType: "image/jpeg" });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0]).toContain("企画の背景");
    expect(generate.mock.calls[0][0]).not.toContain("  企画の背景 ");
  });

  it.each([
    ["JSONでない本文", "not json", true],
    ["配列の本文", [], false],
    ["labelが文字列でない", { label: 1 }, false],
    ["labelが無い", {}, false],
  ])("%s は 400 invalid-request で、生成しない", async (_name, body, raw) => {
    const { deps: d, generate } = deps();

    const response = await handleIllustrationRequest(post(body, raw as boolean), d);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid-request" });
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([[""], ["   "], ["あ".repeat(201)]])("不正なラベルは 400 invalid-label", async (label) => {
    const { deps: d, generate } = deps();

    const response = await handleIllustrationRequest(post({ label }), d);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid-label" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("設定が無ければ 503 not-configured で、生成しない（検証は設定の確認より先）", async () => {
    const createGenerator = jest.fn();

    const response = await handleIllustrationRequest(post({ label: "目標" }), { env: {}, createGenerator });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "not-configured" });
    expect(createGenerator).not.toHaveBeenCalled();
  });

  it("設定が無くても、不正なラベルは 400（設定の有無を漏らさない順序）", async () => {
    const response = await handleIllustrationRequest(post({ label: "" }), {
      env: {},
      createGenerator: jest.fn(),
    });

    expect(response.status).toBe(400);
  });

  it("無料枠の超過は 429、その他の生成失敗は 502", async () => {
    const quota = deps(jest.fn().mockRejectedValue(new ImageGenerationError("quota-exceeded", "q")));
    const upstream = deps(jest.fn().mockRejectedValue(new ImageGenerationError("upstream-error", "u")));

    const quotaResponse = await handleIllustrationRequest(post({ label: "目標" }), quota.deps);
    const upstreamResponse = await handleIllustrationRequest(post({ label: "目標" }), upstream.deps);

    expect(quotaResponse.status).toBe(429);
    expect(await quotaResponse.json()).toEqual({ error: "quota-exceeded" });
    expect(upstreamResponse.status).toBe(502);
    expect(await upstreamResponse.json()).toEqual({ error: "upstream-error" });
  });

  it("想定外の例外も 502 とし、内部のメッセージを返さない", async () => {
    const { deps: d } = deps(jest.fn().mockRejectedValue(new Error("secret internal detail")));

    const response = await handleIllustrationRequest(post({ label: "目標" }), d);

    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("secret internal detail");
  });
});
```

`route.test.ts`（先頭に`/** @jest-environment node */`）:

```ts
/** @jest-environment node */
import { POST } from "@/app/api/illustrations/route";

describe("POST /api/illustrations", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("認証情報が未設定なら 503 not-configured を返す（環境変数から設定を読む配線）", async () => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;

    const response = await POST(new Request("http://localhost/api/illustrations", {
      method: "POST",
      body: JSON.stringify({ label: "目標" }),
    }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "not-configured" });
  });

  it("不正なラベルは 400 を返す", async () => {
    const response = await POST(new Request("http://localhost/api/illustrations", {
      method: "POST",
      body: JSON.stringify({ label: "" }),
    }));

    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: 失敗確認**

Run: `cd client && npx jest src/server/illustration/__tests__/handleIllustrationRequest.test.ts src/app/api`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装**

`handleIllustrationRequest.ts`:

```ts
import {
  buildIllustrationPrompt,
  validateIllustrationLabel,
} from "@/domain/illustration/illustrationPrompt";
import {
  ImageGenerationError,
  readCloudflareConfig,
  type CloudflareConfig,
  type ImageGenerator,
} from "@/server/illustration/cloudflareImageGenerator";

export type IllustrationRouteDeps = {
  env: Record<string, string | undefined>;
  createGenerator: (config: CloudflareConfig) => ImageGenerator;
};

function errorResponse(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

async function readLabel(request: Request): Promise<string | null> {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const label = (body as { label?: unknown }).label;
  return typeof label === "string" ? label : null;
}

export async function handleIllustrationRequest(
  request: Request,
  { env, createGenerator }: IllustrationRouteDeps,
): Promise<Response> {
  const rawLabel = await readLabel(request);
  if (rawLabel === null) return errorResponse("invalid-request", 400);

  const validation = validateIllustrationLabel(rawLabel);
  if (!validation.ok) return errorResponse("invalid-label", 400);

  const config = readCloudflareConfig(env);
  if (config === null) return errorResponse("not-configured", 503);

  try {
    const image = await createGenerator(config)(buildIllustrationPrompt(validation.label));
    return Response.json({ image: image.base64, mimeType: image.mimeType });
  } catch (error) {
    if (error instanceof ImageGenerationError && error.kind === "quota-exceeded") {
      return errorResponse("quota-exceeded", 429);
    }
    return errorResponse("upstream-error", 502);
  }
}
```

`route.ts`（配線だけ）:

```ts
import { createCloudflareImageGenerator } from "@/server/illustration/cloudflareImageGenerator";
import { handleIllustrationRequest } from "@/server/illustration/handleIllustrationRequest";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleIllustrationRequest(request, {
    env: process.env,
    createGenerator: (config) => createCloudflareImageGenerator(config),
  });
}
```

- [ ] **Step 4: 成功確認**

Run: `cd client && npx jest src/server src/app/api && npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 5: ビルド確認**

Run: `cd client && npm run build`
Expected: 成功し、出力のルート一覧に`/api/illustrations`（動的）が含まれる。

- [ ] **Step 6: Commit**

```bash
git add client/src/server/illustration/handleIllustrationRequest.ts client/src/server/illustration/__tests__/handleIllustrationRequest.test.ts client/src/app/api
git commit -m "feat(illustration): イラスト生成のRoute Handlerを追加"
```

---

### Task 4: ブラウザ側のAPIクライアント

**Files:**
- Create: `client/src/services/illustration/illustrationClient.ts`
- Test: `client/src/services/illustration/__tests__/illustrationClient.test.ts`

**Interfaces:**
- Produces:
  - `type IllustrationErrorKind = "invalid-label" | "not-configured" | "quota-exceeded" | "upstream-error" | "network"`
  - `class IllustrationRequestError extends Error { readonly kind: IllustrationErrorKind }`
  - `type IllustrationImage = { dataUrl: string }`
  - `requestIllustration(label: string, options?: { signal?: AbortSignal; fetchImpl?: typeof fetch }): Promise<IllustrationImage>`
    - `POST /api/illustrations`、本文`{ label }`。HTTP 200で、`image`と`mimeType`が文字列なら`{ dataUrl: "data:<mimeType>;base64,<image>" }`を返す。
    - 失敗の対応づけ: `400`→`invalid-label`、`503`→`not-configured`、`429`→`quota-exceeded`、その他のHTTPエラーと、不正な成功応答→`upstream-error`、`fetch`の例外→`network`。
    - `AbortError`（`signal`による中断）は、変換せず、そのまま投げる。
  - `describeIllustrationError(kind: IllustrationErrorKind): string` — 利用者向けの日本語のメッセージ。

メッセージ（固定の文言）:
- `invalid-label`: 「ノードのテキストが空、または長すぎるため、イラストを生成できません。」
- `not-configured`: 「イラスト生成の設定（Cloudflareの認証情報）が見つかりません。README の手順で設定してください。」
- `quota-exceeded`: 「本日の無料の生成枠を使い切りました。時間をおいて（毎日 0:00 UTC にリセット）、再度お試しください。」
- `upstream-error`: 「イラストの生成に失敗しました。時間をおいて、再度お試しください。」
- `network`: 「通信に失敗しました。接続を確認して、再度お試しください。」

- [ ] **Step 1: 失敗するテストを書く**

```ts
import {
  IllustrationRequestError,
  describeIllustrationError,
  requestIllustration,
} from "@/services/illustration/illustrationClient";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("requestIllustration", () => {
  it("ラベルをPOSTし、画像のdata URLを返す", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ image: "ABC", mimeType: "image/jpeg" }));

    const image = await requestIllustration("目標", { fetchImpl });

    expect(image).toEqual({ dataUrl: "data:image/jpeg;base64,ABC" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/illustrations");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ label: "目標" });
  });

  it("signalをfetchへ渡す", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ image: "A", mimeType: "image/jpeg" }));
    const controller = new AbortController();

    await requestIllustration("目標", { fetchImpl, signal: controller.signal });

    expect(fetchImpl.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it.each([
    [400, "invalid-label"],
    [503, "not-configured"],
    [429, "quota-exceeded"],
    [502, "upstream-error"],
    [500, "upstream-error"],
  ])("HTTP %i は %s として投げる", async (status, kind) => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ error: "x" }, status));

    await expect(requestIllustration("目標", { fetchImpl })).rejects.toMatchObject({
      name: "IllustrationRequestError",
      kind,
    });
  });

  it("成功応答でも、画像が文字列でなければ upstream-error", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ image: 1, mimeType: "image/jpeg" }));

    await expect(requestIllustration("目標", { fetchImpl })).rejects.toMatchObject({
      kind: "upstream-error",
    });
  });

  it("JSONでない成功応答は upstream-error", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response("oops", { status: 200 }));

    await expect(requestIllustration("目標", { fetchImpl })).rejects.toMatchObject({
      kind: "upstream-error",
    });
  });

  it("fetchの例外は network", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(requestIllustration("目標", { fetchImpl })).rejects.toMatchObject({ kind: "network" });
  });

  it("中断（AbortError）は変換せず、そのまま投げる", async () => {
    const abortError = new DOMException("aborted", "AbortError");
    const fetchImpl = jest.fn().mockRejectedValue(abortError);

    const error = await requestIllustration("目標", { fetchImpl }).catch((e) => e);

    expect(error).toBe(abortError);
    expect(error).not.toBeInstanceOf(IllustrationRequestError);
  });
});

describe("describeIllustrationError", () => {
  it.each([
    ["invalid-label", "ノードのテキストが空、または長すぎるため、イラストを生成できません。"],
    ["not-configured", "イラスト生成の設定（Cloudflareの認証情報）が見つかりません。README の手順で設定してください。"],
    ["quota-exceeded", "本日の無料の生成枠を使い切りました。時間をおいて（毎日 0:00 UTC にリセット）、再度お試しください。"],
    ["upstream-error", "イラストの生成に失敗しました。時間をおいて、再度お試しください。"],
    ["network", "通信に失敗しました。接続を確認して、再度お試しください。"],
  ] as const)("%s のメッセージ", (kind, message) => {
    expect(describeIllustrationError(kind)).toBe(message);
  });
});
```

- [ ] **Step 2: 失敗確認**

Run: `cd client && npx jest src/services/illustration`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装**

```ts
export type IllustrationErrorKind =
  | "invalid-label"
  | "not-configured"
  | "quota-exceeded"
  | "upstream-error"
  | "network";

export type IllustrationImage = { dataUrl: string };

export class IllustrationRequestError extends Error {
  readonly kind: IllustrationErrorKind;

  constructor(kind: IllustrationErrorKind) {
    super(kind);
    this.name = "IllustrationRequestError";
    this.kind = kind;
  }
}

const ERROR_MESSAGES: Record<IllustrationErrorKind, string> = {
  "invalid-label": "ノードのテキストが空、または長すぎるため、イラストを生成できません。",
  "not-configured": "イラスト生成の設定（Cloudflareの認証情報）が見つかりません。README の手順で設定してください。",
  "quota-exceeded": "本日の無料の生成枠を使い切りました。時間をおいて（毎日 0:00 UTC にリセット）、再度お試しください。",
  "upstream-error": "イラストの生成に失敗しました。時間をおいて、再度お試しください。",
  network: "通信に失敗しました。接続を確認して、再度お試しください。",
};

export function describeIllustrationError(kind: IllustrationErrorKind): string {
  return ERROR_MESSAGES[kind];
}

function kindFromStatus(status: number): IllustrationErrorKind {
  if (status === 400) return "invalid-label";
  if (status === 503) return "not-configured";
  if (status === 429) return "quota-exceeded";
  return "upstream-error";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

type RequestOptions = { signal?: AbortSignal; fetchImpl?: typeof fetch };

export async function requestIllustration(
  label: string,
  { signal, fetchImpl = fetch }: RequestOptions = {},
): Promise<IllustrationImage> {
  let response: Response;
  try {
    response = await fetchImpl("/api/illustrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new IllustrationRequestError("network");
  }

  if (!response.ok) throw new IllustrationRequestError(kindFromStatus(response.status));

  const body: unknown = await response.json().catch(() => null);
  const { image, mimeType } = (body ?? {}) as { image?: unknown; mimeType?: unknown };
  if (typeof image !== "string" || typeof mimeType !== "string") {
    throw new IllustrationRequestError("upstream-error");
  }
  return { dataUrl: `data:${mimeType};base64,${image}` };
}
```

- [ ] **Step 4: 成功確認**

Run: `cd client && npx jest src/services/illustration && npm run lint && npm run typecheck`
Expected: PASS（jsdom環境でも、`Response`が使えない場合は、ファイル先頭に`/** @jest-environment node */`を足す。`DOMException`はNodeにもある）

- [ ] **Step 5: Commit**

```bash
git add client/src/services/illustration
git commit -m "feat(illustration): イラスト生成APIのブラウザ側クライアントを追加"
```

---

### Task 5: 状態を持つ生成の入口（useIllustrationGeneration）

**Files:**
- Modify: `client/src/hooks/useIllustrationGeneration.ts`
- Modify test: `client/src/hooks/__tests__/useIllustrationGeneration.test.ts`（全面的に置き換える）

**Interfaces:**
- Consumes: `requestIllustration`、`describeIllustrationError`、`IllustrationRequestError`（Task 4）、`validateIllustrationLabel`（Task 1）、`Node`
- Produces:
  - `type IllustrationGenerationState = { status: "idle" } | { status: "generating"; nodeId: number } | { status: "succeeded"; nodeId: number; dataUrl: string } | { status: "failed"; nodeId: number; message: string }`
  - `useIllustrationGeneration(nodes: readonly Node[]): { generation: IllustrationGenerationState; generateIllustration: (nodeId: number) => void }`
  - 振る舞い: `generateIllustration(nodeId)`は、(1)生成中なら何もしない、(2)`nodes`に無い`nodeId`なら何もしない、(3)ラベルが検証に通らなければ、リクエストせずに`failed`（`invalid-label`のメッセージ）にする、(4)それ以外は、`generating`にして`requestIllustration`を呼び、成功なら`succeeded`、失敗なら`failed`（`describeIllustrationError`のメッセージ。`IllustrationRequestError`以外の想定外の例外は`upstream-error`）にする。アンマウント時は、進行中のリクエストを中断し、その後に状態を更新しない。

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { act, renderHook } from "@testing-library/react";
import { useIllustrationGeneration } from "@/hooks/useIllustrationGeneration";
import {
  IllustrationRequestError,
  describeIllustrationError,
  requestIllustration,
} from "@/services/illustration/illustrationClient";
import { createTestNode } from "@/testing/createTestNode";

jest.mock("@/services/illustration/illustrationClient", () => {
  const actual = jest.requireActual("@/services/illustration/illustrationClient");
  return { ...actual, requestIllustration: jest.fn() };
});

const mockRequest = requestIllustration as jest.MockedFunction<typeof requestIllustration>;
const nodes = [
  createTestNode({ id: 1, label: "目標" }),
  createTestNode({ id: 2, label: "予算" }),
  createTestNode({ id: 3, label: "   " }),
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("useIllustrationGeneration", () => {
  beforeEach(() => mockRequest.mockReset());

  it("初期状態は idle", () => {
    const { result } = renderHook(() => useIllustrationGeneration(nodes));

    expect(result.current.generation).toEqual({ status: "idle" });
  });

  it("生成中は generating、成功すると succeeded でdata URLを持つ", async () => {
    const pending = deferred<{ dataUrl: string }>();
    mockRequest.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useIllustrationGeneration(nodes));

    act(() => result.current.generateIllustration(1));
    expect(result.current.generation).toEqual({ status: "generating", nodeId: 1 });
    expect(mockRequest).toHaveBeenCalledWith("目標", expect.objectContaining({ signal: expect.any(AbortSignal) }));

    await act(async () => pending.resolve({ dataUrl: "data:image/jpeg;base64,AAA" }));
    expect(result.current.generation).toEqual({
      status: "succeeded",
      nodeId: 1,
      dataUrl: "data:image/jpeg;base64,AAA",
    });
  });

  it("APIの失敗は failed で、種類に応じたメッセージを持つ", async () => {
    mockRequest.mockRejectedValue(new IllustrationRequestError("quota-exceeded"));
    const { result } = renderHook(() => useIllustrationGeneration(nodes));

    await act(async () => result.current.generateIllustration(1));

    expect(result.current.generation).toEqual({
      status: "failed",
      nodeId: 1,
      message: describeIllustrationError("quota-exceeded"),
    });
  });

  it("想定外の例外は upstream-error のメッセージにする", async () => {
    mockRequest.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useIllustrationGeneration(nodes));

    await act(async () => result.current.generateIllustration(1));

    expect(result.current.generation).toMatchObject({
      status: "failed",
      message: describeIllustrationError("upstream-error"),
    });
  });

  it("生成中の再要求は無視する（別のノードでも）", async () => {
    const pending = deferred<{ dataUrl: string }>();
    mockRequest.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useIllustrationGeneration(nodes));

    act(() => result.current.generateIllustration(1));
    act(() => result.current.generateIllustration(1));
    act(() => result.current.generateIllustration(2));

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(result.current.generation).toEqual({ status: "generating", nodeId: 1 });
    await act(async () => pending.resolve({ dataUrl: "d" }));
  });

  it("完了後は、別のノードで、新しく生成できる", async () => {
    mockRequest.mockResolvedValueOnce({ dataUrl: "first" }).mockResolvedValueOnce({ dataUrl: "second" });
    const { result } = renderHook(() => useIllustrationGeneration(nodes));

    await act(async () => result.current.generateIllustration(1));
    await act(async () => result.current.generateIllustration(2));

    expect(mockRequest).toHaveBeenNthCalledWith(2, "予算", expect.anything());
    expect(result.current.generation).toEqual({ status: "succeeded", nodeId: 2, dataUrl: "second" });
  });

  it("空白だけのラベルは、リクエストせずに failed にする", () => {
    const { result } = renderHook(() => useIllustrationGeneration(nodes));

    act(() => result.current.generateIllustration(3));

    expect(mockRequest).not.toHaveBeenCalled();
    expect(result.current.generation).toEqual({
      status: "failed",
      nodeId: 3,
      message: describeIllustrationError("invalid-label"),
    });
  });

  it("存在しないノードIDは何もしない", () => {
    const { result } = renderHook(() => useIllustrationGeneration(nodes));

    act(() => result.current.generateIllustration(999));

    expect(mockRequest).not.toHaveBeenCalled();
    expect(result.current.generation).toEqual({ status: "idle" });
  });

  it("アンマウント時に進行中のリクエストを中断し、その後の解決で状態を更新しない", async () => {
    const pending = deferred<{ dataUrl: string }>();
    mockRequest.mockReturnValue(pending.promise);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useIllustrationGeneration(nodes));
    act(() => result.current.generateIllustration(1));
    const signal = mockRequest.mock.calls[0][1]!.signal as AbortSignal;

    unmount();
    await act(async () => pending.resolve({ dataUrl: "late" }));

    expect(signal.aborted).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("nodes が同じなら、同じ関数を返す", () => {
    const { result, rerender } = renderHook(() => useIllustrationGeneration(nodes));
    const first = result.current.generateIllustration;

    rerender();

    expect(result.current.generateIllustration).toBe(first);
  });
});
```

- [ ] **Step 2: 失敗確認**

Run: `cd client && npx jest src/hooks/__tests__/useIllustrationGeneration.test.ts`
Expected: FAIL（現在のフックは、状態を持たず、引数も取らない）

- [ ] **Step 3: 実装**

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { validateIllustrationLabel } from "@/domain/illustration/illustrationPrompt";
import {
  IllustrationRequestError,
  describeIllustrationError,
  requestIllustration,
} from "@/services/illustration/illustrationClient";
import type { Node } from "@/types/node";

export type IllustrationGenerationState =
  | { status: "idle" }
  | { status: "generating"; nodeId: number }
  | { status: "succeeded"; nodeId: number; dataUrl: string }
  | { status: "failed"; nodeId: number; message: string };

export function useIllustrationGeneration(nodes: readonly Node[]) {
  const [generation, setGeneration] = useState<IllustrationGenerationState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const generateIllustration = useCallback((nodeId: number) => {
    if (controllerRef.current !== null) return;
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (node === undefined) return;

    const validation = validateIllustrationLabel(node.label);
    if (!validation.ok) {
      setGeneration({ status: "failed", nodeId, message: describeIllustrationError("invalid-label") });
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    setGeneration({ status: "generating", nodeId });

    requestIllustration(validation.label, { signal: controller.signal })
      .then((image) => {
        if (controller.signal.aborted) return;
        setGeneration({ status: "succeeded", nodeId, dataUrl: image.dataUrl });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const kind = error instanceof IllustrationRequestError ? error.kind : "upstream-error";
        setGeneration({ status: "failed", nodeId, message: describeIllustrationError(kind) });
      })
      .finally(() => {
        if (controllerRef.current === controller) controllerRef.current = null;
      });
  }, [nodes]);

  return { generation, generateIllustration };
}
```

- [ ] **Step 4: 成功確認**

Run: `cd client && npx jest src/hooks/__tests__/useIllustrationGeneration.test.ts && npm run lint && npm run typecheck`
Expected: PASS。React Compilerのlintが、`controllerRef`の書き込み位置を拒否する場合は、イベントハンドラ・コールバックの中での書き込みであることを確認し、必要なら実装者がlintの指摘に沿って調整し、報告する。`page.tsx`の型エラー（フックの引数・戻り値の変更）は、Task 6で解消するため、この時点の`npm run typecheck`は、`page.tsx`の1件で失敗してよい。その場合は、`typecheck`を、Task 6の完了時にまとめて確認する。

- [ ] **Step 5: Commit**（Task 6と同じ時点でコミットしてよい。`page.tsx`が壊れた状態のコミットを残さないため、Task 5とTask 6は、続けて実施し、Task 6の完了後に、まとめてコミットする）

---

### Task 6: 右パネルの生成状態の表示と配線

**Files:**
- Modify: `client/src/components/layout/IllustrationPanel.tsx`
- Modify: `client/src/app/page.tsx`
- Modify tests: `client/src/components/layout/__tests__/IllustrationPanel.test.tsx`、`client/src/app/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `IllustrationGenerationState`、`useIllustrationGeneration(nodes)`（Task 5）
- Produces: `IllustrationPanel({ selectedNode, generation, onGenerate })` — `generation: IllustrationGenerationState`を追加。
  - 生成中（どのノードでも）: ボタンを無効にし、文言を「生成中…」にする。生成中のノードが、選択中のノードなら、「生成中です」と表示する。
  - `succeeded`かつ`generation.nodeId === selectedNode.id`: `<img src={dataUrl} alt="<ラベル>のイラスト">`を表示する。
  - `failed`かつ`generation.nodeId === selectedNode.id`: `role="alert"`でメッセージを表示する。
  - 選択中のノードと、`generation.nodeId`が異なるときは、プレビュー・エラーを表示しない（ボタンは、生成中でなければ有効）。
  - 既存の挙動（ノード未選択時の案内、無効なボタン、ラベルの表示、`title`）は、変更しない。

- [ ] **Step 1: 失敗するテストを書く**

`IllustrationPanel.test.tsx`: 既存のテストの`render(<IllustrationPanel ... />)`に、`generation={{ status: "idle" }}`を追加する（既存の期待値は変更しない）。以下を追加する。

```tsx
  it("生成中は、ボタンを無効にして『生成中…』と表示する", () => {
    render(
      <IllustrationPanel
        selectedNode={{ id: 1, label: "目標" }}
        generation={{ status: "generating", nodeId: 1 }}
        onGenerate={jest.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "生成中…" })).toBeDisabled();
    expect(screen.getByText("生成中です")).toBeVisible();
  });

  it("別のノードを生成中のときも、ボタンは無効（二重実行の防止）で、選択中のノードには生成中の表示を出さない", () => {
    render(
      <IllustrationPanel
        selectedNode={{ id: 2, label: "予算" }}
        generation={{ status: "generating", nodeId: 1 }}
        onGenerate={jest.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "生成中…" })).toBeDisabled();
    expect(screen.queryByText("生成中です")).not.toBeInTheDocument();
  });

  it("選択中のノードの生成結果を画像で表示する", () => {
    render(
      <IllustrationPanel
        selectedNode={{ id: 1, label: "目標" }}
        generation={{ status: "succeeded", nodeId: 1, dataUrl: "data:image/jpeg;base64,AAA" }}
        onGenerate={jest.fn()}
      />,
    );

    const image = screen.getByRole("img", { name: "目標のイラスト" });
    expect(image).toHaveAttribute("src", "data:image/jpeg;base64,AAA");
    expect(screen.getByRole("button", { name: "イラストを生成" })).toBeEnabled();
  });

  it("ラベルが空のノードの画像は、代替文言を使った説明を持つ", () => {
    render(
      <IllustrationPanel
        selectedNode={{ id: 1, label: "" }}
        generation={{ status: "succeeded", nodeId: 1, dataUrl: "data:image/jpeg;base64,AAA" }}
        onGenerate={jest.fn()}
      />,
    );

    expect(screen.getByRole("img", { name: `${FALLBACK_NODE_LABEL}のイラスト` })).toBeInTheDocument();
  });

  it("別のノードの生成結果は、表示しない", () => {
    render(
      <IllustrationPanel
        selectedNode={{ id: 2, label: "予算" }}
        generation={{ status: "succeeded", nodeId: 1, dataUrl: "data:image/jpeg;base64,AAA" }}
        onGenerate={jest.fn()}
      />,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("選択中のノードの失敗を、alertで表示する", () => {
    render(
      <IllustrationPanel
        selectedNode={{ id: 1, label: "目標" }}
        generation={{ status: "failed", nodeId: 1, message: "生成に失敗しました" }}
        onGenerate={jest.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("生成に失敗しました");
  });

  it("別のノードの失敗は、表示しない", () => {
    render(
      <IllustrationPanel
        selectedNode={{ id: 2, label: "予算" }}
        generation={{ status: "failed", nodeId: 1, message: "生成に失敗しました" }}
        onGenerate={jest.fn()}
      />,
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
```

（`FALLBACK_NODE_LABEL`は`@/config/nodeLabel`からimportする。）

`page.test.tsx`: `useIllustrationGeneration`のモックを、状態を返す形へ変更する。

```tsx
const mockGenerateIllustration = jest.fn();
let mockGeneration: IllustrationGenerationState = { status: "idle" };

jest.mock("@/hooks/useIllustrationGeneration", () => ({
  useIllustrationGeneration: (nodes: readonly Node[]) => {
    mockUseIllustrationGeneration(nodes);
    return { generation: mockGeneration, generateIllustration: mockGenerateIllustration };
  },
}));
```

（`mockUseIllustrationGeneration = jest.fn()`と、`type IllustrationGenerationState`のimportを、先頭に追加する。`beforeEach`で`mockGeneration = { status: "idle" }`、`mockUseIllustrationGeneration.mockClear()`を行う。）`describe("イラスト生成パネルの配線")`に、次を追加する。

```tsx
    it("ノードの一覧を、生成の入口へ渡す", async () => {
      const user = userEvent.setup();
      render(<Home />);
      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));

      expect(mockUseIllustrationGeneration).toHaveBeenLastCalledWith(mockMapStageProps!.nodes);
    });

    it("生成の状態を、パネルへ渡す（選択中のノードの結果を画像で表示する）", async () => {
      const user = userEvent.setup();
      render(<Home />);
      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
      await user.click(screen.getByRole("button", { name: "テスト用ノード選択" }));
      const nodeId = mockMapStageProps!.nodes[0].id;
      mockGeneration = { status: "succeeded", nodeId, dataUrl: "data:image/jpeg;base64,AAA" };
      await user.click(screen.getByRole("button", { name: "テスト用中倍率" })); // 再描画を起こす

      expect(screen.getByRole("img")).toHaveAttribute("src", "data:image/jpeg;base64,AAA");
    });
```

（再描画を起こす操作は、実装者が、既存のテストで使っている操作に合わせて調整してよい。）

- [ ] **Step 2: 失敗確認**

Run: `cd client && npx jest src/components/layout/__tests__/IllustrationPanel.test.tsx src/app/__tests__/page.test.tsx`
Expected: FAIL（`generation`のpropが無い、フックの引数が無い）

- [ ] **Step 3: 実装**

`IllustrationPanel.tsx`（既存の構造を保ち、差分だけを示す）:

```tsx
import type { IllustrationGenerationState } from "@/hooks/useIllustrationGeneration";
// props に generation を追加
type IllustrationPanelProps = {
  selectedNode: Pick<Node, "id" | "label"> | null;
  generation: IllustrationGenerationState;
  onGenerate: (nodeId: number) => void;
};
```

- `const isGenerating = generation.status === "generating";`、`const forSelectedNode = selectedNode !== null && generation.status !== "idle" && generation.nodeId === selectedNode.id;`
- ボタン: `disabled={selectedNode === null || isGenerating}`、文言`{isGenerating ? "生成中…" : "イラストを生成"}`。
- 対象ノードの下に、`forSelectedNode`のときだけ、`generating`なら`<p>生成中です</p>`、`succeeded`なら`<img src={generation.dataUrl} alt={`${getNodeDisplayLabel(selectedNode.label)}のイラスト`} className="w-full rounded-md border border-zinc-200 dark:border-zinc-700" />`、`failed`なら`<p role="alert" className="text-sm text-red-600 dark:text-red-400">{generation.message}</p>`を表示する。

`page.tsx`: `const { generation, generateIllustration } = useIllustrationGeneration(nodes);`、`<IllustrationPanel selectedNode={selectedNode} generation={generation} onGenerate={generateIllustration} />`。

- [ ] **Step 4: 成功確認**

Run: `cd client && npx jest src/hooks src/components/layout src/app && npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 全体検証**

Run: `cd client && npm run verify`
Expected: すべて成功

- [ ] **Step 6: Commit**（Task 5と6を、まとめて）

```bash
git add client/src/hooks client/src/components/layout client/src/app/page.tsx client/src/app/__tests__/page.test.tsx
git commit -m "feat(illustration): 生成の状態を持つ入口と、右パネルの生成結果の表示を追加"
```

---

### Task 7: 設定の手順とROADMAPの更新

**Files:**
- Create: `client/.env.example`
- Modify: `client/README.md`
- Modify: `ROADMAP.md`

- [ ] **Step 1: `client/.env.example`を作成する**

```
# イラスト生成（Cloudflare Workers AI）の認証情報。
# このファイルを .env.local にコピーして、値を設定する。.env.local はコミットしない。
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
```

`.gitignore`が、`client/.env*.local`だけを無視し、`.env.example`は無視しないことを確認する（`git check-ignore client/.env.example`が何も出力しないこと）。

- [ ] **Step 2: `client/README.md`に節を追加する**

既存の内容は、変更しない。末尾に、日本語で、次の節を追加する。
- 見出し「イラスト生成の設定」。
- Cloudflareのアカウント（無料プラン）の作成、「Workers AI」の権限を持つAPIトークンの作成、アカウントIDの確認、`client/.env.local`への設定（`.env.example`をコピー）、開発サーバーの再起動、の手順。
- 無料枠（毎日10,000 Neuronsまで、0:00 UTCにリセット、超過するとエラーになり、課金されない）の説明と、公式の料金ページへのリンク。
- 認証情報は、サーバー側だけが読み、ブラウザへ渡らないこと、`.env.local`をコミットしないこと。

- [ ] **Step 3: `ROADMAP.md`を更新する**

- Phase 7の3項目目`- [ ] ノードのテキストをもとに AI（画像生成 API）でイラストを生成`を`- [x]`にする。
- 「現在地」のPhase 7の行を、次のとおり更新する（文体は、既存の体言止め・「〜できる。」に合わせる）: 右パネルのボタンと右クリックメニューから、選択中のノードのテキストをもとにイラストを生成でき、結果は右パネルにプレビュー表示される（Cloudflare Workers AI。無料枠の範囲）。生成した画像はメモリだけに保持され、保存・ノードへの紐付けは未実装。次の未完了項目は、「生成したイラストをノードに紐付けて表示」。
- 「最終更新」を、更新した日付にする。

- [ ] **Step 4: 全体検証**

Run: `cd client && npm run verify`
Expected: すべて成功

- [ ] **Step 5: Commit**

```bash
git add client/.env.example client/README.md ROADMAP.md
git commit -m "docs(illustration): 認証情報の設定手順を追加し、ROADMAPを更新"
```

---

## Self-Review

- **Spec coverage:** ROADMAP 3項目目は、Task 1〜4（検証、プロンプト、Cloudflare呼び出し、Route Handler、ブラウザ側クライアント）、Task 5・6（入口の状態と表示）、Task 7（設定とROADMAP）で実装する。保存・紐付け・再生成・削除は範囲外（4・5項目目）。
- **二重実行の防止:** 前回のPR（#14）の既知の制限「ボタンを押した後にEnterで生成が再実行される」は、Task 5（生成中の再要求を無視）とTask 6（生成中はボタンを無効化）で解消する。
- **Placeholder scan:** `seed`の型と、無料枠超過時のエラーの形式は、実装時に公式ページで確認する点として、冒頭に明記した。それ以外に、未決の記述はない。
- **Type consistency:** `GeneratedImage`/`ImageGenerator`/`ImageGenerationError`（Task 2）を、Task 3が使う。`IllustrationRequestError`/`describeIllustrationError`/`requestIllustration`（Task 4）を、Task 5が使う。`IllustrationGenerationState`（Task 5）を、Task 6が使う。`validateIllustrationLabel`/`buildIllustrationPrompt`（Task 1）を、Task 3・5が使う。
- **セキュリティ:** APIトークンは、サーバーの`process.env`だけから読み、エラー・レスポンスに含めない（Task 2のテストで固定）。ラベルは、サーバー側でも検証する（Task 3）。
- **既知のリスク:** 無料枠は、1日あたり数十〜数百枚の目安で、超過するとエラーになる（課金はされない）。Cloudflareの無料枠の提供内容は、変更されうる（2026年7月に、一部のモデルが有料プランへ移された）。FLUX.1 schnellが、無料プランから外れた場合は、`createCloudflareImageGenerator`だけを差し替える。

## 実装後の変更

- Cloudflare への呼び出しに、60 秒のタイムアウトを追加した。
- アカウント ID を `/^[A-Za-z0-9_-]+$/` で検証し、不正なら未設定（503）として扱う。
- 429 は一時的な制限の場合もあるため、無料枠超過のメッセージの文言を変更した。
- サーバーが返す `mimeType` を `image/jpeg|png|webp` に限定した。
- README に、公開時の注意（認証なし、Free プラン、公開前の対策）を追記した。
- `client/.gitignore` に `!.env.example` を追加した（Task 7 の docs コミットでの対応で、最終レビュー後の修正ではない。既存の `.env*` が、サンプルも無視していたため）。
- 60 秒のタイムアウトは、fetch だけでなく、応答本文の読み込みにも効く。
- 実際の API は `seed` を拒否する（HTTP 400, code 5006）ため、リクエスト本文から `seed` を外した（本文は `{ prompt, steps: 4 }`）。
- FLUX.1 schnell が、無害なプロンプトを、ランダムに NSFW と誤判定する（HTTP 400, code 8007）ため、`content-rejected` を追加した。ハンドラーは、この場合だけ、生成を最大 3 回まで試し（再試行は最大 2 回）、全て拒否されたら HTTP 422 を返す。クライアントは、専用のメッセージ（「画像生成AIが、内容を不適切と判定しました…」）を表示する。
- FLUX のプロンプトに日本語（ノードのラベル）が入ると、イラストではなく文字を描いてしまうことを、実際の出力を目で見て確認した。そこで、ラベルを `@cf/meta/m2m100-1.2b` で先に英語へ翻訳し、その英語でプロンプトを組み立てるようにした（ASCII だけのラベルは翻訳しない）。
- プロンプトのテンプレートを、英語の概念を埋め込む形（`...symbolizes the concept: ${concept}. One large centered subject ...`）に変更した。概念は 500 文字までに切り詰める。
- Cloudflare の呼び出しとエラーの分類を、共通の `runCloudflareModel`（エラー型は `cloudflareErrors.ts`）に切り出し、画像生成と翻訳で共有した。
- 実測で、FLUX.1 schnell の 1 枚は 172.8 Neurons（`usage.neurons`）だった。翻訳は 1 回 0.3〜0.5 Neurons 程度。
- 翻訳は、日本語の文字（ひらがな・カタカナ・漢字・全角形・半角カタカナ）を含むラベルだけに適用する。絵文字だけのラベルや `café` などは、翻訳せずそのまま使う。
- マップを置き換えたとき（JSON の読み込み）に、古い生成の状態が新しいマップの同じ ID のノードに表示される問題を直した。`useIllustrationGeneration(nodes, resetRevision)` が、状態に保存時の `resetRevision` を添え、違う世代の状態は idle として扱う。置き換え時は、進行中のリクエストを中断してロックを解く。
- 手順書と README の誤りを直した（サインアップ URL の綴り、直接 `curl` の `seed`、無料枠の実測値、時間切れのメッセージ、「最大 3 回まで再試行」の表現、`.env.local` の上書き防止（`cp -n`）、トークンの権限（Read と Edit の両方）、支払い方法を求められたときの案内）。
