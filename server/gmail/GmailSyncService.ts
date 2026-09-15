import type { MailScanDiagnostics } from "../../src/domain/mail";
import type { MailEnvelope, MailScanResult } from "../../src/integrations/mail/MailAdapter";
import { normalizeGmailMessage } from "./GmailMessageNormalizer";
import {
  GmailTransportError,
  type GmailListHistoryResponse,
  type GmailListMessagesResponse,
} from "./GmailTransport";
import type { GmailMessage } from "./gmailTypes";

export const initialGmailQuery = "in:inbox newer_than:90d -category:promotions -category:social";
const initialMessageLimit = 500;

export type GmailScanResponse = MailScanResult & {
  source: "gmail";
  diagnostics: MailScanDiagnostics;
};

export interface GmailTransportPort {
  listMessages(input: { query: string; pageToken?: string; maxResults: number }): Promise<GmailListMessagesResponse>;
  listHistory(input: { startHistoryId: string; pageToken?: string }): Promise<GmailListHistoryResponse>;
  getMessage(id: string): Promise<GmailMessage>;
  getProfile(): Promise<{ historyId: string }>;
}

export class GmailSyncError extends Error {
  constructor(readonly code: "initial-consent-required" | "invalid-history") {
    super(code === "initial-consent-required" ? "Confirm the initial 90-day Gmail scan" : "Gmail history could not be synchronized");
    this.name = "GmailSyncError";
  }
}

type Normalizer = (message: GmailMessage) => MailEnvelope | null;

export class GmailSyncService {
  constructor(
    private readonly transport: GmailTransportPort,
    private readonly normalize: Normalizer = normalizeGmailMessage,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async scan(input: { cursor: string | null; initialSyncConfirmed: boolean }): Promise<GmailScanResponse> {
    if (input.cursor === null) {
      if (!input.initialSyncConfirmed) throw new GmailSyncError("initial-consent-required");
      return this.initialScan(false);
    }
    try {
      return await this.incrementalScan(input.cursor);
    } catch (error) {
      if (error instanceof GmailTransportError && error.status === 404) return this.initialScan(true);
      throw error;
    }
  }

  private async initialScan(recoverySync: boolean): Promise<GmailScanResponse> {
    const ids: string[] = [];
    const seen = new Set<string>();
    let pageToken: string | undefined;
    let truncated = false;
    do {
      const remaining = initialMessageLimit - ids.length;
      const page = await this.transport.listMessages({
        query: initialGmailQuery,
        maxResults: remaining,
        ...(pageToken ? { pageToken } : {}),
      });
      for (const message of page.messages) {
        if (!seen.has(message.id)) {
          seen.add(message.id);
          ids.push(message.id);
          if (ids.length === initialMessageLimit) break;
        }
      }
      pageToken = page.nextPageToken;
      if (ids.length === initialMessageLimit) {
        truncated = Boolean(pageToken) || page.messages.length > remaining;
        break;
      }
    } while (pageToken);

    const profile = await this.transport.getProfile();
    const normalized = await this.fetchAndNormalize(ids, false);
    return this.response(normalized.messages, profile.historyId, {
      truncated,
      recoverySync,
      ignoredMessageCount: normalized.ignoredMessageCount,
    });
  }

  private async incrementalScan(cursor: string): Promise<GmailScanResponse> {
    const ids: string[] = [];
    const seen = new Set<string>();
    let pageToken: string | undefined;
    let nextCursor: string | null = null;
    do {
      const page = await this.transport.listHistory({ startHistoryId: cursor, ...(pageToken ? { pageToken } : {}) });
      nextCursor = page.historyId;
      for (const history of page.history) {
        for (const added of history.messagesAdded ?? []) {
          const id = added.message?.id;
          if (id && !seen.has(id)) {
            seen.add(id);
            ids.push(id);
          }
        }
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    if (!nextCursor) throw new GmailSyncError("invalid-history");

    const normalized = await this.fetchAndNormalize(ids, true);
    return this.response(normalized.messages, nextCursor, {
      truncated: false,
      recoverySync: false,
      ignoredMessageCount: normalized.ignoredMessageCount,
    });
  }

  private async fetchAndNormalize(ids: string[], requireInbox: boolean): Promise<{ messages: MailEnvelope[]; ignoredMessageCount: number }> {
    const results: Array<MailEnvelope | null> = new Array(ids.length);
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < ids.length) {
        const index = nextIndex;
        nextIndex += 1;
        const message = await this.transport.getMessage(ids[index]);
        results[index] = requireInbox && !message.labelIds?.includes("INBOX") ? null : this.normalize(message);
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, ids.length) }, worker));
    return {
      messages: results.filter((message): message is MailEnvelope => Boolean(message)),
      ignoredMessageCount: results.filter((message) => !message).length,
    };
  }

  private response(messages: MailEnvelope[], nextCursor: string, diagnostics: MailScanDiagnostics): GmailScanResponse {
    return { source: "gmail", messages, nextCursor, scannedAt: this.now(), diagnostics };
  }
}
