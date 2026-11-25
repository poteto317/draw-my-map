# Phase 32 AI 支援: 事前確認（inventory）

作成日: 2026-11-25（Task 1）。設計: `2026-11-25-phase32-ai-assist-review-design.md`。

## 1. L-061 入口の一覧

### 1.1 機械的な列挙の結果（`client/`）

- `MapEditor.tsx:879-894` `editorShortcutsEnabled = shortcutsEnabled && …`。積の項は次の 15 件: `commandPalette`・`outlineImport`・`exchangeImport`・`tourEditor`・`presentationPlayback`・`branchMove`・`branchExtract`・`labelReplace`・`nodeSplit`・`nodeMerge`（いずれも `.screen === "closed"`）、`partsDialogMode === null`、`relationPartnerFromId === null`、`!crossMapDialogs.crossMapSearchOpen`、`!crossMapDialogs.brokenLinksDialogOpen`、`!persistence.isConfirmOpen`。
- `MapEditor.tsx:895` `useMapHistoryShortcuts({ undo, redo, enabled: editorShortcutsEnabled })`。ほかの `enabled: editorShortcutsEnabled` の利用者は `MapEditor.tsx:896` 以降。
- `MapEditor.tsx:1251` `inert={!editorShortcutsEnabled && !playingPresentation}`（根の `inert`）。ほかの `inert=` は無い。
- `useNodes.ts:380`（`applyNonStructuralChange: applyNonStructuralChangeRaw`）、`useNodes.ts:460-463`（`isNodeOpBlocked` で包んだ版）。保護モード・競合・外部削除は拒否理由に入らない（設計 §7 の記述どおり）。
- `commandTypes.ts:26-61` `CommandAvailabilityContext` の項目は 34 件（`viewMode`〜`outlineCanEdit`）。`canOpenAiBranchSummary`・`canOpenAiImportance` を足す対象。

### 1.2 設計 §7 の表（写し）

| 入口 | 表示中の扱い |
|------|--------------|
| 他のダイアログ・コマンドパレットを開くショートカット | 止まる（`shortcutsEnabled: false`） |
| Undo / Redo（ボタン・ショートカット） | 止まる。Undo / Redo が他の経路で起きても `documentRevision` か各提案の baseline で古いと判定する |
| 別タブの編集（競合の検出） | 止められない。別タブの保存はこのタブの `nodes` を変えないため、採用時の照合（baseline）では古いと判定しない。このタブに未保存の変更が無ければ `externalUpdate` のまま適用され、その編集で競合の表示（`conflict`）へ移る（自動保存は別タブの内容を上書きしない）。未保存の変更があれば `conflict` になっており、確定の時点で止めて「適用できませんでした（競合中のため実行できません）。」を出す。最新の読み込みなどで `documentRevision` が変われば古いダイアログになる |
| マップの切り替え | ダイアログ表示中は入口が inert。切り替わった場合もマップ ID で古いと判定する |
| プレゼン再生の開始 | 入口が inert。再生中は AI 支援の入口自体を無効にする |
| 保護モードへの移行 | 採用時に `applyNonStructuralChange` が拒否されれば失敗として示す。ただし保護・競合・外部削除は拒否しないため、`useAiAssistDialog` の適用は確定の時点でもこれらを確かめ、当たれば適用せず、入口と同じ文言の理由を添えた「適用できませんでした（競合中のため実行できません）。」などを出す |

### 1.3 入口の表（テストの所有を含む）

| 入口 | AI 支援ダイアログ表示中の扱い | 根拠（ファイル:行） | テストの所有タスク |
|------|------------------------------|---------------------|--------------------|
| `editorShortcutsEnabled` の積（コマンドパレット・箇条書き・交換・ツアー・プレゼン・枝の移動・切り出し・置換・分割・統合・部品・関連線の相手・全マップ検索・リンク切れ・保存の確認） | `aiAssist.screen === "closed"` を積に足す。表示中は根 `inert`・ショートカット停止 | `MapEditor.tsx:879-894`・`:1251` | Task 12（`MapEditorAiAssist.test.tsx`「右パネルから要約を作り、採用して適用すると 1 回の Undo で戻る。表示中は根が inert でショートカットも止まる」） |
| Undo / Redo（ボタン・ショートカット） | 止まる（`canUndo && editorShortcutsEnabled`）。他の経路は `documentRevision`・baseline で古いと判定 | `MapEditor.tsx:895`、`commandTypes.ts:34-35` | Task 10（古さ）・Task 12（停止。`MapEditorAiAssist.test.tsx`「ダイアログ表示中の Ctrl+Z では内容が変わらない」） |
| 別タブの編集（競合） | 止められない。再読込で `documentRevision` が変わり古いダイアログ。再読込が無くても採用時の照合で適用しない | 設計 §7 | Task 4・Task 10 |
| マップの切り替え | 入口が inert。切り替われば `MapEditor` の再マウントで中断（`mapId` でも判定） | `MapEditor.tsx:1251` | Task 10 |
| プレゼン再生の開始 | 入口が inert。再生中は AI 支援の入口を無効 | `MapEditor.tsx:884`・`:1251` | Task 12（`MapEditorAiAssist.test.tsx`「プレゼン再生中は入口を無効にする」） |
| 保護モード・競合・外部削除への移行 | `applyNonStructuralChange` はこれらを理由に拒否しないため、`useAiAssistDialog.apply` が確定の時点で `blockers` を見て適用せず、入口と同じ文言の理由を添えた「適用できませんでした（…のため実行できません）。」を出す（`aiApplyBlockedMessage`） | `useNodes.ts:380`・`:460-463`、`commandTypes.ts:31-33` | Task 10 |
| 関連線・グループの選択 | ノードの選択が無い→入口無効。適用時は `isNodeOpBlocked` で `rejected` | `useNodes.ts:460-463` | Task 9・Task 12（`MapEditorAiAssist.test.tsx`「複数選択では入口を無効にする」、`NodeDetailPanel.test.tsx`「関連線の選択中は「AI支援」の節を出さない」） |
| `CommandAvailabilityContext` の項目 | 2 件（`canOpenAiBranchSummary`・`canOpenAiImportance`）と理由を足す。保護・競合・外部削除は `MUTATING_IDS` で既存の理由 | `commandTypes.ts:26-61` | Task 12（`resolveCommandAvailability.test.ts`「%s は保護モード・競合・外部削除で既存の理由により無効」「AI 支援はアウトライン表示でも使え、入口の理由をそのまま出す」、`MapEditorAiAssist.test.tsx`「保護モードでは入口を無効にし、理由を示す」） |

漏れの確認: 上の列挙で設計 §7 の表に無い入口は見つからなかった。

## 2. SDK の版と型

実行時点（2026-11-25）の `npm view` の最新が、プラン作成時点と同じだった。`--save-exact` で固定し、`client/package.json` の `dependencies` に `^` 無しで入った。

| パッケージ | 版 |
|-----------|----|
| `@anthropic-ai/sdk` | `1.14.0` |
| `openai` | `7.64.0` |

Node は v24.14.1。

### 2.1 誤りのクラス（両 SDK で同じ形）

どちらも `default` エクスポート（クライアントのクラス）に静的メンバーとして付く: `Anthropic.APIError`・`APIConnectionError`・`APIConnectionTimeoutError`・`APIUserAbortError`（OpenAI も同名で `OpenAI.…`）。実行して `typeof` が `function` であることを確認した。名前付きの `APIError` もトップレベルから取れる（`typeof A.APIError === "function"`）。

- `APIError`: `readonly status`・`headers`・`error`・`requestID`。静的 `generate(status: number | undefined, errorResponse: Object | undefined, message: string | undefined, headers: Headers | undefined): APIError`。`generate(429, {error:{}}, "m", new Headers())` は `RateLimitError`（`status` 429）を返す。`generate(500, undefined, "m", new Headers())` は OpenAI で `InternalServerError`。
- `APIUserAbortError`: `constructor({ message }?: { message?: string })`。`status` は `undefined`。
- `APIConnectionError`: `constructor({ message, cause }: { message?: string; cause?: Error })`（引数のオブジェクトは必須。OpenAI で `new OpenAI.APIConnectionError({})` を確認）。`status` は `undefined`。
- `APIConnectionTimeoutError extends APIConnectionError`: `constructor({ message }?: { message?: string })`。`status` は `undefined`。
- 継承: `APIUserAbortError`・`APIConnectionError` は `APIError` の子。`APIConnectionTimeoutError` は `APIConnectionError` の子。したがって「中断／時間切れ／接続」の判定は、子 → 親の順（`APIUserAbortError`、`APIConnectionTimeoutError`、`APIConnectionError`、`APIError`）で `instanceof` する必要がある。
- Claude 側のみ: `RetryableError`・`PaymentRequiredError`（402）・`ContentTooLargeError`（413）・`RequestTimeoutError`（408）など。ステータス別の子クラスはどちらにもある（`AuthenticationError` 401・`RateLimitError` 429・`InternalServerError` ほか）。

### 2.2 クライアントのオプション（構築を実行して確認）

次のオプションでどちらも構築でき、`logLevel`＝`"off"`・`maxRetries`＝0・`timeout`＝120000 が反映された。

- Claude: `new Anthropic({ apiKey, authToken: null, baseURL: "https://api.anthropic.com", timeout: 120_000, maxRetries: 0, logLevel: "off" })`。`apiKey` は `authToken`・`credentials`・`config`・`profile` と排他（`client.d.ts` の注記）。`authToken: null` を明示しても例外にならない。
- OpenAI: `new OpenAI({ apiKey, organization: null, project: null, baseURL: "https://api.openai.com/v1", timeout: 120_000, maxRetries: 0, logLevel: "off" })`。

### 2.3 SDK のログ（L-017・L-029・L-752）

- 両 SDK のクライアントのオプションに `logLevel?: LogLevel` と `logger?: Logger` がある。`LogLevel = 'off' | 'error' | 'warn' | 'info' | 'debug'`（`internal/utils/log.d.ts:10`）。`"off"` を取れる。
- したがって Task 6・7 は `logLevel: "off"` を明示して渡す前提のまま進めてよい（`logger` への置き換えは不要。setup 文書に「SDK のログを止める手段なし」と書く必要もない）。環境変数 `ANTHROPIC_LOG`・`OPENAI_LOG` は、オプションの `logLevel` を明示すればそちらが優先される設計（構築後の `client.logLevel` が `"off"` になることを確認）。

### 2.4 SDK が読むカスタムヘッダーの環境変数（L-752）

- 両 SDK はクライアントの構築時に環境変数のカスタムヘッダーを読み、`defaultHeaders` に混ぜる。値は改行区切りの `名前: 値`。オプションで止める手段は無い。
  - Claude: `client/node_modules/@anthropic-ai/sdk/client.js:178` で `readEnv('ANTHROPIC_CUSTOM_HEADERS')`。`{ ...parsed, ...options.defaultHeaders }` で混ぜる。
  - OpenAI: `client/node_modules/openai/client.js:254` で `readEnv('OPENAI_CUSTOM_HEADERS')`（`provider`・`credential` が無いとき）。`buildHeaders([parsed, options.defaultHeaders])` で混ぜる。
- これらは認証ヘッダーや `OpenAI-Organization`・`OpenAI-Project` を上書きできるので、`organization: null`・`project: null`・明示のキーの効果が崩れうる。
- 対応: コードでは扱わず、**サーバーの環境で `OPENAI_CUSTOM_HEADERS`・`ANTHROPIC_CUSTOM_HEADERS` を設定しない**ことを運用の前提にする。**Task 13 の setup 文書に書く。**

## 3. `messages.create`（Claude）の引数

- `output_config`: `OutputConfig`（`resources/messages/messages.d.ts:3946`）。
  - `format?: JSONOutputFormat | null`。`JSONOutputFormat = { schema: { [key: string]: unknown }; type: 'json_schema' }`。**`name`・`strict` は無い**（`schema` と `type` のみ）。
  - `effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null`。
- よって設計どおり `output_config: { format: { type: "json_schema", schema }, effort: "low" }` が型に合う。

## 4. `responses.create`（OpenAI）の引数と応答

- 引数: `max_output_tokens?: number | null`（`responses.d.ts:910`）、`reasoning?: Shared.Reasoning | null`（`:974`。`effort?: ReasoningEffort | null`、`ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null`）、`text?: ResponseTextConfig`（`:1025`）、`instructions`、`input`。
- `text.format`: `ResponseFormatTextJSONSchemaConfig` は `type: 'json_schema'`・`name: string`・`schema: {…}`・`strict?: boolean | null`（`:2806-2830`）。
- 応答（`Response`）: `status?: ResponseStatus`（`'completed' | 'failed' | 'in_progress' | 'cancelled' | 'queued' | 'incomplete'`）、`incomplete_details: { reason?: 'max_output_tokens' | 'max_messages' | 'content_filter' | 'steered' } | null`、`output`（項目の配列）、`output_text: string`（型は必須の `string`。実 API 未確認のため、実行時に欠ける可能性は残る。アダプタは `typeof` で確かめる）。
- 食い違い: なし。ブリーフの前提どおり。

## 5. 非ストリーミングの制限（Claude SDK 1.14.0）

`resources/messages/messages.js:253-256`:

```
let timeout = options?.timeout ?? this._client._options.timeout;
if (!body.stream && timeout == null) { … calculateNonstreamingTimeout(body.max_tokens, maxNonstreamingTokens) }
```

- 検査（`client.js:925-933` `calculateNonstreamingTimeout`）: `expectedTime = 3,600,000 ms × max_tokens / 128000` が 10 分（600,000 ms）を超える、または `MODEL_NONSTREAMING_TOKENS[model]` を `max_tokens` が超えると `AnthropicError("Streaming is required …")`。
  - 閾値: `max_tokens > 21,333`（`128000 × 600000 / 3600000`）で例外。`max_tokens: 12000` は `expectedTime = 337,500 ms` で通る。
  - モデル別の上限（`internal/constants.js`）は `claude-opus-4@20250514`・`claude-opus-4-1@20250805` ほか 1 件の 8192 のみ。既定の `claude-opus-5-5` は対象外。
- **`timeout` を明示すると（リクエストの `options.timeout` か、クライアントの `timeout: 120_000`）この検査自体が実行されない。** クライアントに `timeout: 120_000` を渡す設計なので掛からない。`max_tokens: 12000` でも掛からない。設計 §4.4 の前提は崩れない。Task 6 に進んでよい。

## 6. `Request` の `Host`・`Sec-Fetch-Site`

実行結果: `localhost:3000 same-origin`（期待どおり。Node v24.14.1）。Task 8 のテストは `new Request(url, { headers: { host, "sec-fetch-site", origin } })` でそのまま作れる。

## 7. 実 API の確認

**実 API 未確認（キーなし）。** `client/.env.local` は存在するが、`ANTHROPIC_API_KEY`・`OPENAI_API_KEY` のどちらも 0 件（空または未設定）。Step 5・6 は飛ばした。根拠は上の §2〜§5（SDK 1.14.0 / 7.64.0 の型定義と、`client.js`・`messages.js` の実装）。

未確認として後に残る点（Task 13 の `docs/testing/browser-test-cases.md` の手動確認か、キーが用意できた時点で埋める）:

- 要約（200 ノード・合計 40,000 文字に近い入力）・重要度（100 ノード）での出力トークン数（要約 4,000・重要度 12,000 の 8 割を超えないか）と所要時間（90 秒以内か）。
- Claude の応答で思考ブロックが text より前に来るか、`stop_reason`、`output_config.format` の挙動、既定モデル `claude-opus-5-5`・`gpt-5` が実在しそのオプションを受けるか。
- 無効なキーでの `errorName`・`status`（型定義上は `AuthenticationError`・401 のはず）。

## 8. 検証

- `cd client && npm run typecheck`: 成功。
- `cd client && npm run lint`: エラー 0・警告 18（SDK の追加前から存在する警告。変更ファイルは `package.json`・`package-lock.json` のみ）。
