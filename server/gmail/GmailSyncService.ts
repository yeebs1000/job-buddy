import { randomBytes } from "node:crypto";
import type { MailScanDiagnostics } from "../../src/domain/mail";
import type { MailEnvelope, MailScanResult } from "../../src/integrations/mail/MailAdapter";
import { normalizeGmailMessage } from "./GmailMessageNormalizer";
import { GmailTransportError, type GmailListHistoryResponse, type GmailListMessagesResponse } from "./GmailTransport";
import type { GmailMessage } from "./gmailTypes";

export const initialGmailQuery = "in:inbox newer_than:90d -category:promotions -category:social";
const initialMessageLimit = 500;
const batchSize = 25;
const checkpointLifetimeMs = 30 * 60_000;

export type GmailScanResponse = MailScanResult & { source: "gmail"; diagnostics: MailScanDiagnostics };
export interface GmailScanInput { cursor: string | null; initialSyncConfirmed: boolean; batch?: boolean; continuationToken?: string }
export interface GmailTransportPort {
  listMessages(input: { query: string; pageToken?: string; maxResults: number }): Promise<GmailListMessagesResponse>;
  listHistory(input: { startHistoryId: string; pageToken?: string }): Promise<GmailListHistoryResponse>;
  getMessage(id: string): Promise<GmailMessage>;
  getProfile(): Promise<{ historyId: string }>;
}
export class GmailSyncError extends Error {
  constructor(readonly code: "initial-consent-required" | "invalid-history" | "gmail-scan-busy" | "gmail-scan-expired" | "gmail-normalization-failed") {
    super(code); this.name = "GmailSyncError";
  }
}
interface ScanPlan {
  ids: string[]; nextCursor: string; requireInbox: boolean; diagnostics: MailScanDiagnostics;
}
interface Checkpoint extends ScanPlan {
  id: string; baseCursor: string | null; expiresAt: number;
  results: Array<MailEnvelope | null>;
  responses: Map<number, GmailScanResponse>;
}

export class GmailSyncService {
  private scanning = false;
  private generation = 0;
  private checkpoint?: Checkpoint;
  constructor(private readonly transport: GmailTransportPort, private readonly normalize = normalizeGmailMessage, private readonly now: () => string = () => new Date().toISOString()) {}

  // Connection changes invalidate resume tokens and any in-flight result.
  reset(): void { this.generation++; this.checkpoint = undefined; }

  async scan(input: GmailScanInput): Promise<GmailScanResponse> {
    if (this.scanning) throw new GmailSyncError("gmail-scan-busy");
    this.scanning = true;
    const generation = this.generation;
    try {
      if (this.checkpoint && this.checkpoint.expiresAt <= Date.now()) this.checkpoint = undefined;
      if (!input.continuationToken && input.cursor === null && !input.initialSyncConfirmed) throw new GmailSyncError("initial-consent-required");
      let offset = 0;
      let job = input.batch ? this.checkpoint : undefined;
      if (input.continuationToken) {
        const match = /^([a-f0-9]{32}):(\d+)$/.exec(input.continuationToken);
        if (!input.batch || !job || !match || match[1] !== job.id || job.baseCursor !== input.cursor) throw new GmailSyncError("gmail-scan-expired");
        offset = Number(match[2]);
        if (!Number.isSafeInteger(offset) || offset < batchSize || offset % batchSize !== 0 || job.responses.get(offset - batchSize)?.continuationToken !== input.continuationToken) throw new GmailSyncError("gmail-scan-expired");
      } else if (!job || job.baseCursor !== input.cursor || job.results.length === job.ids.length) {
        const plan = await this.plan(input.cursor);
        if (generation !== this.generation) throw new GmailSyncError("gmail-scan-expired");
        job = { ...plan, id: randomBytes(16).toString("hex"), baseCursor: input.cursor, expiresAt: Date.now() + checkpointLifetimeMs, results: [], responses: new Map() };
        if (input.batch) this.checkpoint = job;
      }
      if (!job) throw new GmailSyncError("gmail-scan-expired");
      const cached = job.responses.get(offset);
      if (cached) return cached; // A lost HTTP response is safe to retry.
      const end = input.batch ? Math.min(offset + batchSize, job.ids.length) : job.ids.length;
      while (job.results.length < end) {
        if (generation !== this.generation) throw new GmailSyncError("gmail-scan-expired");
        let message: GmailMessage;
        try { message = await this.transport.getMessage(job.ids[job.results.length]); }
        catch (error) {
          if (error instanceof GmailTransportError && error.status === 404) {
            job.results.push(null); job.diagnostics.ignoredMessageCount++; continue;
          }
          throw error;
        }
        if (generation !== this.generation) throw new GmailSyncError("gmail-scan-expired");
        let normalized: MailEnvelope | null;
        try { normalized = job.requireInbox && !message.labelIds?.includes("INBOX") ? null : this.normalize(message); }
        catch { throw new GmailSyncError("gmail-normalization-failed"); }
        job.results.push(normalized);
        if (!normalized) job.diagnostics.ignoredMessageCount++;
      }
      if (generation !== this.generation) throw new GmailSyncError("gmail-scan-expired");
      const result: GmailScanResponse = {
        source: "gmail", messages: job.results.slice(offset, end).filter((message): message is MailEnvelope => message !== null),
        nextCursor: job.nextCursor, scannedAt: this.now(), diagnostics: { ...job.diagnostics },
        ...(input.batch ? { progress: { processed: end, total: job.ids.length }, ...(end < job.ids.length ? { continuationToken: `${job.id}:${end}` } : {}) } : {}),
      };
      job.responses.set(offset, result);
      return result;
    } finally { this.scanning = false; }
  }

  private async plan(cursor: string | null): Promise<ScanPlan> {
    if (cursor === null) return this.initialPlan(false);
    try { return await this.historyPlan(cursor); }
    catch (error) {
      if (error instanceof GmailTransportError && error.status === 404) return this.initialPlan(true);
      throw error;
    }
  }

  private async initialPlan(recoverySync: boolean): Promise<ScanPlan> {
    // Capture before listing so arrivals during the scan remain in subsequent history.
    const profile = await this.transport.getProfile();
    const ids: string[] = []; const seen = new Set<string>();
    let pageToken: string | undefined; let truncated = false;
    do {
      const remaining = initialMessageLimit - ids.length;
      const page = await this.transport.listMessages({ query: initialGmailQuery, maxResults: remaining, ...(pageToken ? { pageToken } : {}) });
      for (const message of page.messages) {
        if (!seen.has(message.id)) { seen.add(message.id); ids.push(message.id); if (ids.length === initialMessageLimit) break; }
      }
      pageToken = page.nextPageToken;
      if (ids.length === initialMessageLimit) { truncated = Boolean(pageToken) || page.messages.length > remaining; break; }
    } while (pageToken);
    return { ids, nextCursor: profile.historyId, requireInbox: false, diagnostics: { truncated, recoverySync, ignoredMessageCount: 0 } };
  }

  private async historyPlan(cursor: string): Promise<ScanPlan> {
    const ids: string[] = []; const seen = new Set<string>();
    let pageToken: string | undefined; let nextCursor: string | null = null;
    do {
      const page = await this.transport.listHistory({ startHistoryId: cursor, ...(pageToken ? { pageToken } : {}) });
      nextCursor = page.historyId;
      for (const history of page.history) for (const added of history.messagesAdded ?? []) {
        const id = added.message?.id;
        if (id && !seen.has(id)) { seen.add(id); ids.push(id); }
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    if (!nextCursor) throw new GmailSyncError("invalid-history");
    return { ids, nextCursor, requireInbox: true, diagnostics: { truncated: false, recoverySync: false, ignoredMessageCount: 0 } };
  }
}
