// 保存するイラストの大きさ。表示は 48px で、PNG エクスポート（2倍）でも足りる大きさにする
export const ILLUSTRATION_THUMBNAIL_SIZE = 128;
export const ILLUSTRATION_THUMBNAIL_QUALITY = 0.85;
// localStorage（約5MB）を使い切らないための、1枚あたりの上限
export const MAX_ILLUSTRATION_DATA_URL_LENGTH = 100_000;
// 復元するイラストの縦横の上限。保存されるのは 128px だが、改ざんされた巨大画像でデコード時にメモリ不足になるのを防ぐ
export const MAX_ILLUSTRATION_IMAGE_DIMENSION = 512;
