# Security Policy

## Supported versions

Security fixes are applied on the default branch (`main`). This project is primarily intended for **local, single-developer** use.

## Reporting a vulnerability

Please report security issues through [GitHub Private Vulnerability Reporting](https://github.com/poteto317/draw-my-map/security/advisories/new).

Do **not** open a public Issue for problems that could lead to credential abuse, quota theft, or remote exploitation.

## Local credentials and deployment

- Store Cloudflare credentials only in `client/.env.local`. Never commit them.
- Prefer an API token scoped to **Workers AI** only (avoid account-wide tokens).
- The illustration API (`POST /api/illustrations`) has **no authentication, Origin checks, or rate limiting**. Do **not** deploy this app to a public URL with credentials configured until those controls exist.
- The AI assist API (`/api/ai-assist/*`) also has **no authentication or rate limiting** (it only rejects requests whose `Host` is not in an allowlist — `localhost`, `127.0.0.1`, `[::1]`, plus `AI_ASSIST_ALLOWED_HOSTS` — and cross-site browser requests via `Origin`, `Sec-Fetch-Site`, and `Content-Type` checks). Do **not** deploy this app to a public URL with `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` configured. If a key may have leaked, **revoke it and create a new one** in the provider's console. See `docs/setup/ai-assist-setup.md`.
- If this repository became public, or credentials may have appeared outside git (chat, screenshots, shared machines), **rotate the Cloudflare API token** and revoke the old one.
