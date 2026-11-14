export type OperationNotice = {
  kind: "status" | "warning" | "error";
  message: string;
};

export type ShellNotice = {
  sequence: number;
  notice: OperationNotice;
};
