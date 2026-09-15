export type MailSource = "simulated" | "gmail";

export interface MailScanDiagnostics {
  truncated: boolean;
  recoverySync: boolean;
  ignoredMessageCount: number;
}

export interface MailScanContext {
  initialSyncConfirmed?: boolean;
}
