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
}

export interface MailAdapter {
  scan(cursor: string | null): Promise<MailScanResult>;
}
