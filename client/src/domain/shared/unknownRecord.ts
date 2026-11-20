// 外部から受け取った値（JSON・ストレージ・ネットワークの応答）を、as によるキャストなしで読むための型ガード

// null と配列を除くオブジェクト。JSON のオブジェクト（{...}）にあたる
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 通常のプレーンオブジェクト（Object.prototype または null プロトタイプ）のみを許可する
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// プロトタイプ継承キーを拾わず、自身の列挙・非列挙プロパティかを判定する
export function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

// 自身の列挙可能キーがすべて allowed に含まれるかを判定する
export function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

// value がオブジェクト（配列を含む）なら value[key] を、それ以外（null・文字列・数値など）なら undefined を返す。
// プリミティブのプロパティ（文字列の length など）は読まない。応答の項目（JSON のオブジェクトのキー）を読む用途に限る
export function readProperty(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  const property: unknown = Reflect.get(value, key);
  return property;
}
