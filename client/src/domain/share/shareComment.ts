/** コメント API の到達経路（comment リンクのトークン / 所有者セッション＋sharedMapId） */
export type ShareCommentsScope =
  | { kind: "token"; token: string }
  | { kind: "owner"; sharedMapId: string };

/** API 応答のコメント（server / client 共用の正本）。Google sub・メールは含めない */
export type ShareCommentView = {
  readonly id: string;
  readonly authorName: string;
  readonly body: string;
  readonly createdAt: string;
  /** 閲覧者がこのコメントを消せるか（サーバー判定） */
  readonly canDelete: boolean;
};

export type ShareCommentThreadView = {
  readonly id: string;
  readonly nodeId: number;
  readonly nodeLabelSnapshot: string;
  readonly status: "open" | "resolved";
  readonly resolvedByName: string | null;
  readonly resolvedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** 解決・再開とも */
  readonly canResolve: boolean;
  readonly comments: readonly ShareCommentView[];
};

export type ShareCommentViewer = {
  readonly signedIn: boolean;
  /** signedIn かつ comment 権限（所有者経路では常に true） */
  readonly canPost: boolean;
  readonly isOwner: boolean;
};

export type ShareCommentListValue = {
  readonly threads: readonly ShareCommentThreadView[];
  readonly viewer: ShareCommentViewer;
};

export type ShareCommentDeleteValue = {
  readonly commentId: string;
  readonly threadDeleted: boolean;
};

/** 一覧の取得状態（閲覧シェル・所有者の hook が共用） */
export type ShareCommentsListState = "idle" | "loading" | "ready" | "error";
