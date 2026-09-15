export type MailSource = "simulated" | "gmail";

export interface MailScanDiagnostics {
  truncated: boolean;
  recoverySync: boolean;
  ignoredMessageCount: number;
}

export interface MailScanContext {
  initialSyncConfirmed?: boolean;
}

export type GmailConnectionStatus = {
  state: "unconfigured" | "disconnected" | "connected" | "reconnect-required";
  accountEmail?: string;
  platformSupported: boolean;
  lastError?: "missing-config" | "token-revoked" | "platform-unsupported";
};
