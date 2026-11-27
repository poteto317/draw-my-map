export type ShareCommentCapabilitiesInput = {
  /** 未ログインは null */
  readonly viewerUserId: string | null;
  readonly isOwner: boolean;
  readonly threadCreatedByUserId: string;
  /** スレッド単位の判定だけなら null */
  readonly commentAuthorUserId: string | null;
};

export type ShareCommentCapabilities = {
  readonly canResolve: boolean;
  readonly canDelete: boolean;
};

/** 能力判定の唯一の純関数（一覧の算出と書込み時の再検査で共用） */
export function resolveShareCommentCapabilities(
  input: ShareCommentCapabilitiesInput,
): ShareCommentCapabilities {
  const { viewerUserId, isOwner, threadCreatedByUserId, commentAuthorUserId } = input;
  const canResolve =
    isOwner || (viewerUserId !== null && viewerUserId === threadCreatedByUserId);
  const canDelete =
    commentAuthorUserId !== null &&
    (isOwner || (viewerUserId !== null && viewerUserId === commentAuthorUserId));
  return { canResolve, canDelete };
}
