export type ShareResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };
