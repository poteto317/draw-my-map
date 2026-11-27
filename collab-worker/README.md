# collab-worker

Phase 39 共同編集用 Cloudflare Worker + Durable Object。

## 役割

- `GET/WS /collab/:sessionId` — ticket 検証後に Yjs sync / awareness
- `POST /rooms/:sessionId/seed` — 管理 API（`Authorization: Bearer <SERVICE_SECRET>`）
- `GET /rooms/:sessionId/export`
- `GET /rooms/:sessionId/connections`

## 秘密（リポジトリに書かない）

| 名前 | 用途 |
|------|------|
| `TICKET_SECRET` | Next の `CF_COLLAB_TICKET_SECRET`（または `AUTH_SECRET`）と同一 |
| `SERVICE_SECRET` | Next の `CF_COLLAB_SERVICE_SECRET` と同一 |
| `ARTIFACT_EVACUATE_URL` | 任意。全員切断 TTL（5 分）後の成果物 POST 先 |
| `PARTICIPANT_DROP_URL` | 任意。grace 脱落時の参加者削除 POST 先（`/api/collab/drop-participant`） |

```bash
npx wrangler secret put TICKET_SECRET
npx wrangler secret put SERVICE_SECRET
```

## 制約

- 同時接続 8（超過は WS close 4429 / 管理側は接続数で判定）
- 切断後 2 分以内は再接続猶予、超過で脱落
- 全員切断後 5 分で成果物退避してルーム破棄
- 所有者不在でも他参加者は継続
- ticket 平文はログに出さない

## テスト

```bash
npm install
npm test
```
