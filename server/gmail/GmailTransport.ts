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
  constructor(readonly status: number) {
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
  constructor(private readonly tokens: AccessTokenProvider, private readonly fetcher: typeof fetch = fetch) {}

  async listMessages(input: { query: string; pageToken?: string; maxResults: number }): Promise<GmailListMessagesResponse> {
    const url = new URL(`${gmailApi}/messages`);
    url.searchParams.set("q", input.query);
    url.searchParams.set("maxResults", String(Math.max(1, Math.min(500, input.maxResults))));
    if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);
    const payload = await this.request(url);
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
    const payload = await this.request(url);
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
    return await this.request(url) as GmailMessage;
  }

  async getProfile(): Promise<{ historyId: string }> {
    const payload = await this.request(new URL(`${gmailApi}/profile`));
    if (typeof payload.historyId !== "string" || !payload.historyId) throw new GmailTransportError(502);
    return { historyId: payload.historyId };
  }

  private async request(url: URL): Promise<Record<string, unknown>> {
    const accessToken = await this.tokens.getAccessToken();
    let response: Response;
    try {
      response = await this.fetcher(url, { headers: { authorization: `Bearer ${accessToken}` } });
    } catch {
      throw new GmailTransportError(503);
    }
    if (!response.ok) throw new GmailTransportError(response.status);
    const payload = object(await response.json().catch(() => null));
    if (!payload) throw new GmailTransportError(502);
    return payload;
  }
}
