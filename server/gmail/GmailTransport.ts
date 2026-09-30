import type { GmailMessage } from "./gmailTypes";

const gmailApi = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailMessageReference {
  id: string;
  threadId?: string;
}

export interface GmailHistoryEntry {
  id?: string;
  messagesAdded?: Array<{ message?: GmailMessageReference & { labelIds?: string[] } }>;
}

export interface GmailListMessagesResponse {
  messages: GmailMessageReference[];
  nextPageToken?: string;
}

export interface GmailListHistoryResponse {
  history: GmailHistoryEntry[];
  historyId: string;
  nextPageToken?: string;
}

export class GmailTransportError extends Error {
  constructor(readonly status: number, readonly code = "gmail-request-failed", readonly operation?: "profile" | "list" | "history" | "message") {
    super("Gmail request failed");
    this.name = "GmailTransportError";
  }
}

interface AccessTokenProvider {
  getAccessToken(): Promise<string>;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function messageReferences(value: unknown): GmailMessageReference[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new GmailTransportError(502);
  return value.map((entry) => {
    const item = object(entry);
    if (!item || typeof item.id !== "string" || !item.id) throw new GmailTransportError(502);
    return { id: item.id, ...(typeof item.threadId === "string" ? { threadId: item.threadId } : {}) };
  });
}

function historyEntries(value: unknown): GmailHistoryEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new GmailTransportError(502);
  return value.map((entry) => {
    const item = object(entry);
    if (!item) throw new GmailTransportError(502);
    if (item.messagesAdded !== undefined && !Array.isArray(item.messagesAdded)) throw new GmailTransportError(502);
    const messagesAdded = (item.messagesAdded ?? []).map((addition) => {
      const added = object(addition);
      const message = object(added?.message);
      if (!message || typeof message.id !== "string" || !message.id) throw new GmailTransportError(502);
      if (message.labelIds !== undefined && (!Array.isArray(message.labelIds) || !message.labelIds.every((label) => typeof label === "string"))) {
        throw new GmailTransportError(502);
      }
      return { message: {
        id: message.id,
        ...(typeof message.threadId === "string" ? { threadId: message.threadId } : {}),
        ...(Array.isArray(message.labelIds) ? { labelIds: message.labelIds as string[] } : {}),
      } };
    });
    return {
      ...(typeof item.id === "string" ? { id: item.id } : {}),
      ...(messagesAdded.length ? { messagesAdded } : {}),
    };
  });
}

export class GmailTransport {
  private nextRequestAt = 0;
  constructor(private readonly tokens: AccessTokenProvider, private readonly fetcher: typeof fetch = fetch) {}

  async listMessages(input: { query: string; pageToken?: string; maxResults: number }): Promise<GmailListMessagesResponse> {
    const url = new URL(`${gmailApi}/messages`);
    url.searchParams.set("q", input.query);
    url.searchParams.set("maxResults", String(Math.max(1, Math.min(500, input.maxResults))));
    if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);
    const payload = await this.request(url, "list");
    return {
      messages: messageReferences(payload.messages),
      ...(typeof payload.nextPageToken === "string" && payload.nextPageToken ? { nextPageToken: payload.nextPageToken } : {}),
    };
  }

  async listHistory(input: { startHistoryId: string; pageToken?: string }): Promise<GmailListHistoryResponse> {
    const url = new URL(`${gmailApi}/history`);
    url.searchParams.set("startHistoryId", input.startHistoryId);
    url.searchParams.set("historyTypes", "messageAdded");
    url.searchParams.set("maxResults", "500");
    if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);
    const payload = await this.request(url, "history");
    if (typeof payload.historyId !== "string" || !payload.historyId) throw new GmailTransportError(502);
    return {
      history: historyEntries(payload.history),
      historyId: payload.historyId,
      ...(typeof payload.nextPageToken === "string" && payload.nextPageToken ? { nextPageToken: payload.nextPageToken } : {}),
    };
  }

  async getMessage(id: string): Promise<GmailMessage> {
    const url = new URL(`${gmailApi}/messages/${encodeURIComponent(id)}`);
    url.searchParams.set("format", "full");
    return await this.request(url, "message") as GmailMessage;
  }

  async getProfile(): Promise<{ historyId: string }> {
    const payload = await this.request(new URL(`${gmailApi}/profile`), "profile");
    if (typeof payload.historyId !== "string" || !payload.historyId) throw new GmailTransportError(502);
    return { historyId: payload.historyId };
  }

  private async request(url: URL, operation: "profile" | "list" | "history" | "message"): Promise<Record<string, unknown>> {
    for (let attempt = 0; ; attempt++) {
      // A peer can extend the shared cooldown while this request is waiting.
      while (this.nextRequestAt > Date.now()) {
        await new Promise(resolve => setTimeout(resolve, this.nextRequestAt - Date.now()));
      }
      const accessToken = await this.tokens.getAccessToken();
      let response: Response;
      let payload: Record<string, unknown> | null;
      try {
        response = await this.fetcher(url, { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(20_000) });
        payload = object(await response.json().catch(error => { if (response.ok) throw error; return null; }));
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        const code = name === "TimeoutError" || name === "AbortError" ? "gmail-timeout" : name === "SyntaxError" ? "gmail-response-invalid" : "gmail-network-error";
        if (attempt >= 2) throw new GmailTransportError(503, code, operation);
        await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt + Math.floor(Math.random() * 1000)));
        continue;
      }
      // Bound groups in the scanner and pause between them; success cannot erase a quota cooldown.
      this.nextRequestAt = Math.max(this.nextRequestAt, Date.now() + 250);
      if (response.ok) {
        if (!payload) throw new GmailTransportError(502, "gmail-response-invalid", operation);
        return payload;
      }
      const error = object(payload?.error);
      const reasons = Array.isArray(error?.errors) ? error.errors.map(entry => object(entry)?.reason) : [];
      const limited = response.status === 429 || (response.status === 403 && reasons.some(reason => reason === "rateLimitExceeded" || reason === "userRateLimitExceeded"));
      const retryable = limited || response.status >= 500;
      const code = limited ? "gmail-rate-limited" : response.status === 401 ? "reconnect-required" : response.status === 403 ? "gmail-access-denied" : "gmail-request-failed";
      if (!retryable || attempt >= 6) throw new GmailTransportError(response.status, code, operation);
      const retryAfter = response.headers.get("retry-after");
      const seconds = retryAfter === null ? NaN : Number(retryAfter);
      const requestedWait = Number.isFinite(seconds) ? seconds * 1000 : retryAfter ? Date.parse(retryAfter) - Date.now() : 0;
      // Do not retry earlier than Google's requested window or wait indefinitely.
      if (requestedWait > 60_000) throw new GmailTransportError(response.status, code, operation);
      const backoff = Math.max(1000 * 2 ** attempt + Math.floor(Math.random() * 1000), requestedWait || 0);
      this.nextRequestAt = Math.max(this.nextRequestAt, Date.now() + backoff);
    }
  }
}
