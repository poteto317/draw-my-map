// 保存するイラストの大きさ。表示は 48px で、PNG エクスポート（2倍）でも足りる大きさにする
export const ILLUSTRATION_THUMBNAIL_SIZE = 128;
export const ILLUSTRATION_THUMBNAIL_QUALITY = 0.85;
// localStorage（約5MB）を使い切らないための、1枚あたりの上限
export const MAX_ILLUSTRATION_DATA_URL_LENGTH = 100_000;
// 復元するイラストの縦横の上限。保存されるのは 128px だが、改ざんされた巨大画像でデコード時にメモリ不足になるのを防ぐ
export const MAX_ILLUSTRATION_IMAGE_DIMENSION = 512;
// 任意画像アップロード入口。FileReader / Image.decode 前に拒否してタブ OOM を防ぐ
export const MAX_ILLUSTRATION_UPLOAD_BYTES = 5 * 1024 * 1024;
// アップロード元の縦横上限（サムネイル前）。保存後上限より大きく、数千 px 超の写真でデコードが膨らまない値
export const MAX_ILLUSTRATION_UPLOAD_DIMENSION = 4096;
