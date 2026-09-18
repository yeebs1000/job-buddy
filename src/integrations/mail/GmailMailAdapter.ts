import type { MailScanContext, MailScanDiagnostics } from "../../domain/mail";
import { isSafeExternalHttpsUrl } from "../../domain/jobUrl";
import type { MailAdapter, MailEnvelope, MailScanResult } from "./MailAdapter";
import { GmailScanError } from "./gmailScanErrors";

export interface GmailScanRequest {
  cursor: string | null;
  initialSyncConfirmed: boolean;
  batch: true;
  continuationToken?: string;
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
  const forwarded = object(item.forwarded);
  if (item.forwarded !== undefined && (!forwarded || typeof forwarded.fromAddress !== "string" || forwarded.fromAddress.length > 320
    || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(forwarded.fromAddress)
    || typeof forwarded.subject !== "string" || forwarded.subject.length > 300)) return null;
  return {
    providerMessageId: item.providerMessageId,
    ...(typeof item.threadId === "string" ? { threadId: item.threadId } : {}),
    ...(typeof item.fromName === "string" ? { fromName: item.fromName } : {}),
    fromAddress: item.fromAddress,
    subject: item.subject,
    receivedAt: item.receivedAt,
    excerpt: item.excerpt,
    links: [...item.links] as string[],
    ...(forwarded ? { forwarded: { fromAddress: forwarded.fromAddress as string, subject: forwarded.subject as string } } : {}),
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
    || !parsedDiagnostics) throw new GmailScanError("gmail-response-invalid");
  const messages = item.messages.map(envelope);
  if (messages.some((message) => !message)) throw new GmailScanError("gmail-response-invalid");
  const progress = object(item.progress);
  if (item.progress !== undefined && (!progress || !Number.isSafeInteger(progress.processed) || !Number.isSafeInteger(progress.total)
    || (progress.processed as number) < 0 || (progress.total as number) < (progress.processed as number))) throw new GmailScanError("gmail-response-invalid");
  if (item.continuationToken !== undefined && (typeof item.continuationToken !== "string" || !/^[a-f0-9]{32}:\d{1,10}$/.test(item.continuationToken)
    || !progress || (progress.processed as number) >= (progress.total as number))) throw new GmailScanError("gmail-response-invalid");
  if (progress && !item.continuationToken && progress.processed !== progress.total) throw new GmailScanError("gmail-response-invalid");
  return { messages: messages as MailEnvelope[], nextCursor: item.nextCursor, scannedAt: item.scannedAt, diagnostics: parsedDiagnostics,
    ...(progress ? { progress: { processed: progress.processed as number, total: progress.total as number } } : {}),
    ...(typeof item.continuationToken === "string" ? { continuationToken: item.continuationToken } : {}),
  };
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
    throw new GmailScanError("gmail-companion-unreachable");
  }
  if (!response.ok) {
    const payload = object(await response.json().catch(() => null));
    const code = object(payload?.error)?.code;
    throw new GmailScanError(code === "internal-error" ? "gmail-companion-error" : code);
  }
  return response.json().catch(() => { throw new GmailScanError("gmail-response-invalid"); });
};

export class GmailMailAdapter implements MailAdapter {
  readonly source = "gmail" as const;

  constructor(private readonly client: GmailCompanionClient = fetchGmailCompanionClient) {}

  async scan(cursor: string | null, context?: MailScanContext): Promise<MailScanResult> {
    return parseScanResult(await this.client({ cursor, initialSyncConfirmed: context?.initialSyncConfirmed === true, batch: true,
      ...(context?.continuationToken ? { continuationToken: context.continuationToken } : {}),
    }));
  }
}
