export type OperationNotice = {
  kind: "status" | "warning" | "error";
  message: string;
};
