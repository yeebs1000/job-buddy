import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import type { GmailConnectionStatus } from "../gmail/GmailConnectionService";
import type { GmailScanResponse } from "../gmail/GmailSyncService";

interface ConnectionServicePort {
  status(): Promise<GmailConnectionStatus>;
  start(): Promise<{ authorizationUrl: string }>;
  complete(input: { code: string; state: string }): Promise<void>;
  disconnect(): Promise<{ revocationConfirmed: boolean }>;
}

interface SyncServicePort {
  scan(input: { cursor: string | null; initialSyncConfirmed: boolean }): Promise<GmailScanResponse>;
}

export interface CompanionServerServices {
  connection: ConnectionServicePort;
  sync: SyncServicePort;
}

export interface CompanionServerOptions {
  services: CompanionServerServices;
  allowedOrigins: readonly string[];
  uiOrigin: string;
  staticDir?: string;
}

class HttpInputError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

const maxBodyBytes = 16 * 1024;

function applySecurityHeaders(response: ServerResponse): void {
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "no-referrer");
}

function json(response: ServerResponse, status: number, body: unknown): void {
  applySecurityHeaders(response);
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function allowedOrigin(request: IncomingMessage, options: CompanionServerOptions): string | null {
  const origin = request.headers.origin;
  return typeof origin === "string" && options.allowedOrigins.includes(origin) ? origin : null;
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) throw new HttpInputError(415, "json-required");
  const declared = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declared) && declared > maxBodyBytes) throw new HttpInputError(413, "body-too-large");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > maxBodyBytes) throw new HttpInputError(413, "body-too-large");
    chunks.push(buffer);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpInputError(400, "invalid-json");
  }
}

function safeError(error: unknown): { status: number; code: string } {
  if (error instanceof HttpInputError) return error;
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "internal-error";
  const statuses: Record<string, number> = {
    "initial-consent-required": 409,
    "missing-config": 409,
    "platform-unsupported": 501,
    "invalid-state": 400,
    "offline-access-required": 409,
    "reconnect-required": 409,
    "request-failed": 502,
    "invalid-history": 502,
  };
  return { status: statuses[code] ?? 500, code: code in statuses ? code : "internal-error" };
}

async function serveStatic(request: IncomingMessage, response: ServerResponse, staticDir: string): Promise<boolean> {
  if (request.method !== "GET") return false;
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  const decoded = decodeURIComponent(pathname);
  const requested = extname(decoded) ? resolve(staticDir, `.${decoded}`) : resolve(staticDir, "index.html");
  const root = resolve(staticDir);
  if (requested !== root && !requested.startsWith(`${root}${sep}`)) return false;
  try {
    const body = await readFile(requested);
    const contentTypes: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };
    applySecurityHeaders(response);
    response.statusCode = 200;
    response.setHeader("content-type", contentTypes[extname(requested)] ?? "application/octet-stream");
    response.end(body);
    return true;
  } catch {
    return false;
  }
}

export function createCompanionServer(options: CompanionServerOptions) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const origin = allowedOrigin(request, options);
      if (request.method === "POST") {
        if (!origin) throw new HttpInputError(403, "origin-not-allowed");
        response.setHeader("access-control-allow-origin", origin);
        response.setHeader("vary", "Origin");
      } else if (origin) {
        response.setHeader("access-control-allow-origin", origin);
        response.setHeader("vary", "Origin");
      }

      if (request.method === "GET" && url.pathname === "/api/gmail/status") {
        const status = await options.services.connection.status();
        json(response, 200, {
          state: status.state,
          ...(status.accountEmail ? { accountEmail: status.accountEmail } : {}),
          platformSupported: status.platformSupported,
          ...(status.lastError ? { lastError: status.lastError } : {}),
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/gmail/oauth/start") {
        await readJson(request);
        json(response, 200, await options.services.connection.start());
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/gmail/oauth/callback") {
        try {
          const code = url.searchParams.get("code") ?? "";
          const state = url.searchParams.get("state") ?? "";
          await options.services.connection.complete({ code, state });
          response.statusCode = 302;
          response.setHeader("location", `${options.uiOrigin}/settings?gmail=connected`);
        } catch {
          response.statusCode = 302;
          response.setHeader("location", `${options.uiOrigin}/settings?gmail=error`);
        }
        applySecurityHeaders(response);
        response.end();
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/gmail/scan") {
        const body = await readJson(request);
        const cursor = body.cursor;
        const initialSyncConfirmed = body.initialSyncConfirmed;
        if (!(cursor === null || typeof cursor === "string") || typeof initialSyncConfirmed !== "boolean") throw new HttpInputError(400, "invalid-scan-request");
        json(response, 200, await options.services.sync.scan({ cursor, initialSyncConfirmed }));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/gmail/disconnect") {
        await readJson(request);
        json(response, 200, await options.services.connection.disconnect());
        return;
      }
      if (options.staticDir && await serveStatic(request, response, options.staticDir)) return;
      json(response, 404, { error: { code: "not-found" } });
    } catch (error) {
      const safe = safeError(error);
      if (safe.status === 403) response.removeHeader("access-control-allow-origin");
      json(response, safe.status, { error: { code: safe.code } });
    }
  });
}
