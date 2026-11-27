export type {
  CollabSessionEndValue,
  CollabSessionGetValue,
  CollabSessionStartValue,
  CollabTicketClaims,
} from "@/domain/collab/collabApiDto";

/** D1 collab_sessions 行。creating = DO seed 前。公開参加は active のみ */
export type CollabSessionStatus = "creating" | "active" | "ended" | "failed";

export type CollabSessionRow = {
  id: string;
  ownerUserId: string;
  localMapId: string;
  sharedMapId: string | null;
  status: CollabSessionStatus;
  artifactR2Key: string | null;
  createdAt: string;
  endedAt: string | null;
};

export type CollabParticipantRow = {
  sessionId: string;
  userId: string;
  joinedAt: string;
};
