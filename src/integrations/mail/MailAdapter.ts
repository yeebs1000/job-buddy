export interface MailEnvelope {
  providerMessageId: string;
  threadId?: string;
  fromName?: string;
  fromAddress: string;
  subject: string;
  receivedAt: string;
  excerpt: string;
  links: string[];
}

export interface MailScanResult {
  messages: MailEnvelope[];
  nextCursor: string;
  scannedAt: string;
  diagnostics?: MailScanDiagnostics;
}

export interface MailAdapter {
  readonly source: MailSource;
  scan(cursor: string | null, context?: MailScanContext): Promise<MailScanResult>;
}
import type { MailScanContext, MailScanDiagnostics, MailSource } from "../../domain/mail";
