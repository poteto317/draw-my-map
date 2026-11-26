/** 発行直後だけ返る共有リンク（平文 token は再表示 API なし） */
export type ShareLinkIssued = {
  linkId: string;
  /** 成功応答のキーは常に url（shareUrl ではない） */
  url: string;
  /** 一度きり。再表示 API なし */
  token: string;
};

/** 初回共有（create + publish + link）成功時の値 */
export type CreateShareValue = {
  sharedMapId: string;
  link: ShareLinkIssued;
};
