/** 本文の上限（正規化後の UTF-16 コード単位） */
export const SHARE_COMMENT_BODY_MAX_LENGTH = 2000;
/** 正規化前の早期拒否（巨大入力で正規化に入らない） */
export const SHARE_COMMENT_BODY_RAW_MAX_LENGTH = 8000;
export const SHARE_COMMENT_AUTHOR_NAME_MAX_CODE_POINTS = 50;
export const SHARE_COMMENT_NODE_LABEL_SNAPSHOT_MAX_CODE_POINTS = 80;
export const SHARE_COMMENT_MAX_THREADS_PER_MAP = 200;
export const SHARE_COMMENT_MAX_COMMENTS_PER_MAP = 1000;
export const SHARE_COMMENT_MAX_COMMENTS_PER_THREAD = 50;
/** コメント API のリクエスト本文の上限（バイト） */
export const SHARE_COMMENT_MAX_BODY_BYTES = 16 * 1024;
