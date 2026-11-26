import { createHmac } from "node:crypto";

/** 閲覧トークンの keyed hash（平文は保存しない）。secret は引数／env から渡す */
export function tokenHash(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token, "utf8").digest("hex");
}
