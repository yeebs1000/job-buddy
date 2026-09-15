import type { MailScanContext, MailScanDiagnostics } from "../../domain/mail";
import { isSafeExternalHttpsUrl } from "../../domain/jobUrl";
import type { MailAdapter, MailEnvelope, MailScanResult } from "./MailAdapter";

export interface GmailScanRequest {
  cursor: string | null;
  initialSyncConfirmed: boolean;
}

export type GmailCompanionClient = (input: GmailScanRequest) => Promise<unknown>;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function envelope(value: unknown): MailEnvelope | null {
  const item = object(value);
  if (!item || typeof item.providerMessageId !== "string" || !item.providerMessageId
    || typeof item.fromAddress !== "string" || typeof item.subject !== "string"
    || typeof item.receivedAt !== "string" || !Number.isFinite(Date.parse(item.receivedAt))
    || typeof item.excerpt !== "string" || Array.from(item.excerpt).length > 600
    || !Array.isArray(item.links) || item.links.length > 10
    || !item.links.every((link) => typeof link === "string" && isSafeExternalHttpsUrl(link))) return null;
  return {
    providerMessageId: item.providerMessageId,
    ...(typeof item.threadId === "string" ? { threadId: item.threadId } : {}),
    ...(typeof item.fromName === "string" ? { fromName: item.fromName } : {}),
    fromAddress: item.fromAddress,
    subject: item.subject,
    receivedAt: item.receivedAt,
    excerpt: item.excerpt,
    links: [...item.links] as string[],
  };
}

function diagnostics(value: unknown): MailScanDiagnostics | null {
  const item = object(value);
  return item && typeof item.truncated === "boolean" && typeof item.recoverySync === "boolean"
    && typeof item.ignoredMessageCount === "number" && Number.isInteger(item.ignoredMessageCount) && item.ignoredMessageCount >= 0
    ? { truncated: item.truncated, recoverySync: item.recoverySync, ignoredMessageCount: item.ignoredMessageCount }
    : null;
}

function parseScanResult(value: unknown): MailScanResult {
  const item = object(value);
  const parsedDiagnostics = diagnostics(item?.diagnostics);
  if (!item || item.source !== "gmail" || !Array.isArray(item.messages)
    || typeof item.nextCursor !== "string" || !item.nextCursor
    || typeof item.scannedAt !== "string" || !Number.isFinite(Date.parse(item.scannedAt))
    || !parsedDiagnostics) throw new Error("Gmail scan returned an invalid response");
  const messages = item.messages.map(envelope);
  if (messages.some((message) => !message)) throw new Error("Gmail scan returned an invalid response");
  return { messages: messages as MailEnvelope[], nextCursor: item.nextCursor, scannedAt: item.scannedAt, diagnostics: parsedDiagnostics };
}

export const fetchGmailCompanionClient: GmailCompanionClient = async (input) => {
  let response: Response;
  try {
    response = await fetch("/api/gmail/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Gmail scan could not reach the local companion");
  }
  if (!response.ok) throw new Error("Gmail scan could not be completed");
  return response.json().catch(() => { throw new Error("Gmail scan returned an invalid response"); });
};

export class GmailMailAdapter implements MailAdapter {
  readonly source = "gmail" as const;

  constructor(private readonly client: GmailCompanionClient = fetchGmailCompanionClient) {}

  async scan(cursor: string | null, context?: MailScanContext): Promise<MailScanResult> {
    return parseScanResult(await this.client({ cursor, initialSyncConfirmed: context?.initialSyncConfirmed === true }));
  }
}
