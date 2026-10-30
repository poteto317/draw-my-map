// 外部から受け取った値（JSON・ストレージ・ネットワークの応答）を、as によるキャストなしで読むための型ガード

// null と配列を除くオブジェクト。JSON のオブジェクト（{...}）にあたる
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// value がオブジェクト（配列を含む）なら value[key] を、それ以外（null・文字列・数値など）なら undefined を返す。
// プリミティブのプロパティ（文字列の length など）は読まない。応答の項目（JSON のオブジェクトのキー）を読む用途に限る
export function readProperty(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  const property: unknown = Reflect.get(value, key);
  return property;
}
