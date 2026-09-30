import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { OAuthPopupStore } from "../gmail/OAuthPopupStore";
import { desktopClientIdSchema, desktopClientSecretSchema } from "../gmail/DesktopClientStore";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import type { GmailConnectionStatus } from "../../src/domain/mail";
import type { BuddyActivityEntry, BuddyPreferences, PendingCapture, PendingSalaryEvidence } from "../../src/domain/buddy";
import type { CandidateProfile, ProfileSelection } from "../../src/domain/profile";
import type { GmailScanInput, GmailScanResponse } from "../gmail/GmailSyncService";
import { z } from "zod";
import { currencySchema, marketSchema, type Market, type Currency } from "../../src/domain/research";
import { boardSchema, type JobBoard, type DiscoveryResult, type PostingPay } from "../../src/domain/discovery";
import type { FxQuote } from "../../src/domain/fx";
import { webSalaryQuerySchema, type WebSalaryQuery, type WebSalaryResponse } from "../../src/domain/webSalary";
import { tavilyKeySchema, type ResearchSearchStatus } from "../../src/domain/researchSearch";
import { searchErrorCodes } from "../research/TavilySearchService";

interface ConnectionServicePort {
  configureDesktopClient?(clientId: string, clientSecret?: string): Promise<void>;
  status(): Promise<GmailConnectionStatus>;
  start(): Promise<{ authorizationUrl: string }>;
  complete(input: { code: string; state: string }): Promise<void>;
  disconnect(): Promise<{ revocationConfirmed: boolean }>;
}

interface SyncServicePort {
  scan(input: GmailScanInput): Promise<GmailScanResponse>;
  reset?(): void;
}

interface ProfileServicePort {
  status(): Promise<{ platformSupported: boolean; hasProfile: boolean }>;
  read(): Promise<CandidateProfile>;
  replace(input: unknown): Promise<CandidateProfile>;
  select(paths: readonly string[]): Promise<ProfileSelection>;
  delete(): Promise<void>;
}

interface BuddyServicePort {
  pairStart(): { code: string; expiresAt: string };
  pairComplete(input: { code: string; origin: string }): Promise<{ token: string }>;
  revoke(): Promise<void>;
  status(): Promise<{ paired: false } | { paired: true; origin: string; pairedAt: string }>;
  getPreferences(): Promise<BuddyPreferences>;
  setPreferences(input: unknown): Promise<BuddyPreferences>;
  listActivity(): Promise<BuddyActivityEntry[]>;
  clearActivity(): Promise<void>;
  listCaptures(): Promise<PendingCapture[]>;
  deleteCapture(id: string): Promise<void>;
  selectProfile(auth: { token: string; origin: string }, paths: readonly string[]): Promise<ProfileSelection>;
  readPreferences(auth: { token: string; origin: string }): Promise<BuddyPreferences>;
  updateExtensionPreference(auth: { token: string; origin: string }, input: unknown): Promise<BuddyPreferences>;
  appendActivity(auth: { token: string; origin: string }, input: unknown): Promise<void>;
  addCapture(auth: { token: string; origin: string }, input: unknown): Promise<PendingCapture>;
  listSalaryEvidence(): Promise<PendingSalaryEvidence[]>;
  deleteSalaryEvidence(id: string): Promise<void>;
  addSalaryEvidence(auth: { token: string; origin: string }, input: unknown): Promise<PendingSalaryEvidence>;
}

interface ResearchServicePort {
  status(): Promise<Array<{ market: Market; activeReleaseId?: string; activatedAt?: string; quarantineCount: number; latestQuarantinePath?: string }>>;
  refresh(market?: Market): Promise<Array<{ market: Market; ok: boolean; releaseId?: string; error?: string }>>;
  lookup(query: { market: Market; canonicalRole: string; metroCode?: string; state?: string }): Promise<unknown>;
}

export interface CompanionServerServices {
  connection: ConnectionServicePort;
  sync: SyncServicePort;
  profile: ProfileServicePort;
  buddy: BuddyServicePort;
  research?: ResearchServicePort;
  webSalary?: { status(): { configured: boolean } | Promise<ResearchSearchStatus>; configure?(key: string): Promise<void>; removeKey?(): Promise<void>; search(query: WebSalaryQuery): Promise<WebSalaryResponse> };
  discovery?: { list(board: JobBoard): Promise<DiscoveryResult>; salary(input: { board: JobBoard; postingId: string }): Promise<PostingPay[]> };
  fx?: { quote(base: Currency, quote: Currency): Promise<FxQuote> };
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
const maxProfileBodyBytes = 128 * 1024;

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

function popupComplete(response: ServerResponse, result: "pending" | "connected" | "error" | "client-config"): void {
  const nonce = randomBytes(18).toString("base64");
  applySecurityHeaders(response);
  response.statusCode = 200;
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.setHeader("content-security-policy", `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'`);
  // Never reflect OAuth query values into this page or pass tokens to the opener.
  const title = result === "connected" ? "Gmail connected" : result === "pending" ? "Sign-in is processing" : "Sign-in did not finish";
  response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Job Buddy — Gmail</title><style nonce="${nonce}">body{font:16px system-ui;color:#182230;background:#f5f5f7;margin:48px;line-height:1.6}h1{font-size:24px}</style><h1>${title}</h1><p>Return to your Job Buddy dashboard. You can close this window.</p><script nonce="${nonce}">history.replaceState(null,"","/api/gmail/oauth/callback");window.close();</script></html>`);
}

function allowedOrigin(request: IncomingMessage, options: CompanionServerOptions): string | null {
  const origin = request.headers.origin;
  if (origin !== undefined) return typeof origin === "string" && options.allowedOrigins.includes(origin) ? origin : null;
  // Same-origin browser GETs omit Origin. Browser-controlled fetch metadata plus
  // an exact loopback Host permits reads, never writes or cross-site navigation.
  // Vite's proxy preserves the original Host (changeOrigin must remain false).
  const localOrigin = `http://${request.headers.host ?? ""}`;
  return request.method === "GET"
    && request.headers["sec-fetch-site"] === "same-origin"
    && ["cors", "same-origin"].includes(String(request.headers["sec-fetch-mode"]))
    && request.headers["sec-fetch-dest"] === "empty"
    && options.allowedOrigins.includes(localOrigin) ? localOrigin : null;
}

function noContent(response: ServerResponse): void {
  applySecurityHeaders(response);
  response.statusCode = 204;
  response.end();
}

function extensionOrigin(request: IncomingMessage): string | null {
  const origin = request.headers.origin;
  return typeof origin === "string" && /^chrome-extension:\/\/[a-p]{32}$/.test(origin) ? origin : null;
}

function bearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization;
  const match = typeof authorization === "string" ? /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(authorization) : null;
  if (!match) throw new HttpInputError(401, "unauthorized");
  return match[1];
}

async function readJson(request: IncomingMessage, limit = maxBodyBytes): Promise<Record<string, unknown>> {
  if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) throw new HttpInputError(415, "json-required");
  const declared = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declared) && declared > limit) throw new HttpInputError(413, "body-too-large");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > limit) throw new HttpInputError(413, "body-too-large");
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
    "gmail-rate-limited": 429,
    "gmail-access-denied": 403,
    "gmail-request-failed": 502,
    "gmail-scan-busy": 409,
    "gmail-scan-expired": 409,
    "gmail-timeout": 503,
    "gmail-network-error": 503,
    "gmail-response-invalid": 502,
    "gmail-normalization-failed": 502,
    "missing-config": 409,
    "setup-managed": 409,
    "disconnect-required": 409,
    "connection-busy": 409,
    "client-config": 409,
    "platform-unsupported": 501,
    "invalid-state": 400,
    "offline-access-required": 409,
    "reconnect-required": 409,
    "request-failed": 502,
    "invalid-history": 502,
    "invalid-profile": 400,
    "invalid-pairing": 400,
    "unauthorized": 401,
    "confirmation-required": 409,
    "invalid-preference": 400,
    "research-unavailable": 503,
    "invalid-research-query": 400,
    "source-refresh-failed": 502,
    "insufficient-evidence": 404,
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
  const popups = new OAuthPopupStore();
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const origin = allowedOrigin(request, options);
      const buddyPath = url.pathname.startsWith("/api/buddy/");
      const pairedOrigin = buddyPath ? extensionOrigin(request) : null;
      const responseOrigin = origin ?? pairedOrigin;
      if (request.method === "POST" || request.method === "PUT" || request.method === "DELETE") {
        if (buddyPath ? !responseOrigin : !origin) throw new HttpInputError(403, "origin-not-allowed");
        response.setHeader("access-control-allow-origin", responseOrigin!);
        response.setHeader("vary", "Origin");
      } else if (responseOrigin) {
        response.setHeader("access-control-allow-origin", responseOrigin);
        response.setHeader("vary", "Origin");
      }

      if (request.method === "OPTIONS" && buddyPath && pairedOrigin) {
        const requestedMethod = request.headers["access-control-request-method"]?.toUpperCase() ?? "";
        const requestedHeaders = (request.headers["access-control-request-headers"] ?? "")
          .split(",")
          .map((header) => header.trim().toLowerCase())
          .filter(Boolean);
        const allowedMethods = ["GET", "POST", "PUT", "DELETE"];
        const allowedHeaders = new Set(["authorization", "content-type"]);
        if (!allowedMethods.includes(requestedMethod) || requestedHeaders.some((header) => !allowedHeaders.has(header))) {
          throw new HttpInputError(403, "origin-not-allowed");
        }
        response.setHeader("access-control-allow-methods", allowedMethods.join(", "));
        response.setHeader("access-control-allow-headers", "authorization, content-type");
        response.setHeader("access-control-max-age", "600");
        noContent(response);
        return;
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
      if (url.pathname.startsWith("/api/discovery/") || url.pathname === "/api/research/fx") {
        if (!origin) throw new HttpInputError(403, "origin-not-allowed");
        if (request.method !== "POST") throw new HttpInputError(405, "method-not-allowed");
        if (url.pathname === "/api/research/fx") {
          const parsed = z.object({ base: currencySchema, quote: currencySchema }).strict().safeParse(await readJson(request));
          if (!parsed.success) throw new HttpInputError(400, "invalid-currency-pair");
          if (!options.services.fx) throw new HttpInputError(503, "fx-unavailable");
          try { json(response, 200, await options.services.fx.quote(parsed.data.base, parsed.data.quote)); }
          catch { throw new HttpInputError(502, "fx-unavailable"); }
          return;
        }
        if (!options.services.discovery) throw new HttpInputError(503, "discovery-unavailable");
        if (url.pathname === "/api/discovery/jobs") {
          const parsed = boardSchema.safeParse(await readJson(request));
          if (!parsed.success) throw new HttpInputError(400, "invalid-job-board");
          try { json(response, 200, await options.services.discovery.list(parsed.data)); }
          catch { throw new HttpInputError(502, "board-unavailable"); }
          return;
        }
        if (url.pathname === "/api/discovery/salary") {
          const parsed = z.object({ board: boardSchema, postingId: z.string().regex(/^[a-zA-Z0-9-]{1,100}$/) }).strict().safeParse(await readJson(request));
          if (!parsed.success) throw new HttpInputError(400, "invalid-job-posting");
          try { json(response, 200, { salary: await options.services.discovery.salary(parsed.data) }); }
          catch { throw new HttpInputError(502, "posting-unavailable"); }
          return;
        }
        throw new HttpInputError(404, "not-found");
      }
      if (url.pathname.startsWith("/api/research/web-salary/")) {
        if (!origin) throw new HttpInputError(403, "origin-not-allowed");
        const service = options.services.webSalary;
        if (request.method === "GET" && url.pathname === "/api/research/web-salary/status") {
          try { json(response, 200, await service?.status() ?? { configured: false }); }
          catch { throw new HttpInputError(503, "web-search-storage-unavailable"); }
          return;
        }
        if (url.pathname === "/api/research/web-salary/key") {
          if (!service?.configure || !service.removeKey) throw new HttpInputError(503, "web-search-unconfigured");
          if (request.method !== "POST" && request.method !== "DELETE") throw new HttpInputError(405, "method-not-allowed");
          const parsed = request.method === "POST" ? z.object({ apiKey: tavilyKeySchema }).strict().safeParse(await readJson(request, 2048)) : undefined;
          if (parsed && !parsed.success) throw new HttpInputError(400, "invalid-research-key");
          try {
            if (parsed?.success) await service.configure(parsed.data.apiKey); else await service.removeKey();
            json(response, 200, await service.status());
          } catch { throw new HttpInputError(503, "web-search-storage-unavailable"); }
          return;
        }
        if (request.method !== "POST" || url.pathname !== "/api/research/web-salary/search") throw new HttpInputError(405, "method-not-allowed");
        const query = webSalaryQuerySchema.safeParse(await readJson(request));
        if (!query.success) throw new HttpInputError(400, "invalid-research-query");
        if (!service) throw new HttpInputError(503, "web-search-unconfigured");
        try { json(response, 200, await service.search(query.data)); }
        catch (error) {
          const code = error instanceof Error ? error.message : "";
          throw new HttpInputError(code === "web-search-rate-limited" || code === "web-search-budget-exhausted" ? 429 : 503, searchErrorCodes.includes(code) ? code : "web-search-failed");
        }
        return;
      }
      if (url.pathname.startsWith("/api/research/")) {
        if (!origin) throw new HttpInputError(403, "origin-not-allowed");
        const research = options.services.research;
        if (!research) throw new HttpInputError(503, "research-unavailable");
        if (request.method === "GET" && url.pathname === "/api/research/status") {
          const markets = (await research.status()).map(({ latestQuarantinePath: _, ...status }) => status);
          json(response, 200, { markets });
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/research/refresh") {
          const parsed = z.object({ market: marketSchema.optional() }).strict().safeParse(await readJson(request));
          if (!parsed.success) throw new HttpInputError(400, "invalid-research-query");
          const results = await research.refresh(parsed.data.market);
          if (results.length && results.every((result) => !result.ok)) throw new HttpInputError(502, "source-refresh-failed");
          json(response, 200, { results });
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/research/lookup") {
          const parsed = z.object({
            market: marketSchema,
            canonicalRole: z.string().trim().min(1).max(100),
            metroCode: z.string().trim().min(1).max(20).optional(),
            state: z.string().trim().min(2).max(50).optional(),
          }).strict().safeParse(await readJson(request));
          if (!parsed.success) throw new HttpInputError(400, "invalid-research-query");
          const result = await research.lookup(parsed.data);
          if (result && typeof result === "object" && "status" in result && result.status === "insufficient_evidence") throw new HttpInputError(404, "insufficient-evidence");
          json(response, 200, result);
          return;
        }
      }
      if (request.method === "POST" && url.pathname === "/api/gmail/setup") {
        const body = z.object({ clientId: desktopClientIdSchema, clientSecret: desktopClientSecretSchema.optional() }).strict().safeParse(await readJson(request));
        if (!body.success) throw new HttpInputError(400, "invalid-client-id");
        if (!options.services.connection.configureDesktopClient) throw new HttpInputError(503, "setup-unavailable");
        options.services.sync.reset?.();
        await options.services.connection.configureDesktopClient(body.data.clientId, body.data.clientSecret);
        popups.invalidatePending();
        noContent(response);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/gmail/oauth/start") {
        const body = z.object({ popup: z.boolean().optional() }).strict().safeParse(await readJson(request));
        if (!body.success) throw new HttpInputError(400, "invalid-oauth-request");
        options.services.sync.reset?.();
        const result = await options.services.connection.start();
        const popupId = body.data.popup ? popups.create(new URL(result.authorizationUrl).searchParams.get("state") ?? "", origin!) : undefined;
        json(response, 200, { ...result, ...(popupId ? { popupId } : {}) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/gmail/oauth/popup-result") {
        const body = z.object({ popupId: z.string().regex(/^[a-f0-9]{48}$/) }).strict().safeParse(await readJson(request));
        if (!body.success) throw new HttpInputError(400, "invalid-popup-request");
        json(response, 200, { state: popups.result(body.data.popupId, origin!) });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/gmail/oauth/callback") {
        const state = url.searchParams.get("state") ?? "";
        const popup = popups.find(state);
        if (popup && !popups.claim(state)) {
          popupComplete(response, popup.result);
          return;
        }
        try {
          const code = url.searchParams.get("code") ?? "";
          await options.services.connection.complete({ code, state });
          options.services.sync.reset?.();
          if (popup) {
            popups.finish(state, "connected"); popupComplete(response, "connected"); return;
          }
          response.statusCode = 302;
          response.setHeader("location", `${options.uiOrigin}/settings?gmail=connected`);
        } catch (error) {
          if (popup) {
            const result = safeError(error).code === "client-config" ? "client-config" : "error";
            popups.finish(state, result); popupComplete(response, result); return;
          }
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
        if (body.batch !== undefined && typeof body.batch !== "boolean") throw new HttpInputError(400, "invalid-scan-request");
        if (body.continuationToken !== undefined && (typeof body.continuationToken !== "string" || !/^[a-f0-9]{32}:\d{1,10}$/.test(body.continuationToken) || body.batch !== true)) throw new HttpInputError(400, "invalid-scan-request");
        json(response, 200, await options.services.sync.scan({ cursor, initialSyncConfirmed,
          ...(body.batch !== undefined ? { batch: body.batch } : {}),
          ...(typeof body.continuationToken === "string" ? { continuationToken: body.continuationToken } : {}),
        }));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/gmail/disconnect") {
        await readJson(request);
        popups.invalidatePending();
        options.services.sync.reset?.();
        json(response, 200, await options.services.connection.disconnect());
        return;
      }
      if (url.pathname === "/api/profile") {
        if (!origin) throw new HttpInputError(403, "origin-not-allowed");
        if (request.method === "GET") {
          const status = await options.services.profile.status();
          json(response, 200, {
            ...status,
            profile: status.platformSupported ? await options.services.profile.read() : null,
          });
          return;
        }
        if (request.method === "PUT") {
          const profile = await options.services.profile.replace(await readJson(request, maxProfileBodyBytes));
          json(response, 200, { profile });
          return;
        }
        if (request.method === "DELETE") {
          await readJson(request);
          await options.services.profile.delete();
          applySecurityHeaders(response);
          response.statusCode = 204;
          response.end();
          return;
        }
      }
      if (request.method === "GET" && url.pathname === "/api/buddy/status") {
        if (!origin) throw new HttpInputError(403, "origin-not-allowed");
        json(response, 200, await options.services.buddy.status());
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/buddy/pairing/start") {
        if (!origin) throw new HttpInputError(403, "origin-not-allowed");
        await readJson(request);
        json(response, 200, options.services.buddy.pairStart());
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/buddy/pairing/complete") {
        if (!pairedOrigin) throw new HttpInputError(403, "origin-not-allowed");
        const body = await readJson(request);
        if (typeof body.code !== "string") throw new HttpInputError(400, "invalid-pairing");
        json(response, 200, await options.services.buddy.pairComplete({ code: body.code, origin: pairedOrigin }));
        return;
      }
      if (request.method === "DELETE" && url.pathname === "/api/buddy/pairing") {
        if (!origin) throw new HttpInputError(403, "origin-not-allowed");
        await readJson(request);
        await options.services.buddy.revoke();
        noContent(response);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/buddy/profile/select") {
        if (!pairedOrigin) throw new HttpInputError(403, "origin-not-allowed");
        const token = bearerToken(request);
        const body = await readJson(request);
        if (!Array.isArray(body.paths) || !body.paths.every((path) => typeof path === "string") || body.paths.length > 100) throw new HttpInputError(400, "invalid-profile-selection");
        json(response, 200, { selection: await options.services.buddy.selectProfile({ token, origin: pairedOrigin }, body.paths) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/buddy/preferences/read") {
        if (!pairedOrigin) throw new HttpInputError(403, "origin-not-allowed");
        const token = bearerToken(request);
        await readJson(request);
        json(response, 200, { preferences: await options.services.buddy.readPreferences({ token, origin: pairedOrigin }) });
        return;
      }
      if (url.pathname === "/api/buddy/preferences") {
        if (request.method === "GET") {
          if (origin) json(response, 200, { preferences: await options.services.buddy.getPreferences() });
          else if (pairedOrigin) json(response, 200, { preferences: await options.services.buddy.readPreferences({ token: bearerToken(request), origin: pairedOrigin }) });
          else throw new HttpInputError(403, "origin-not-allowed");
          return;
        }
        if (request.method === "PUT") {
          const body = await readJson(request);
          if (origin) json(response, 200, { preferences: await options.services.buddy.setPreferences(body) });
          else if (pairedOrigin) json(response, 200, { preferences: await options.services.buddy.updateExtensionPreference({ token: bearerToken(request), origin: pairedOrigin }, body) });
          else throw new HttpInputError(403, "origin-not-allowed");
          return;
        }
      }
      if (url.pathname === "/api/buddy/activity") {
        if (request.method === "GET") {
          if (!origin) throw new HttpInputError(403, "origin-not-allowed");
          json(response, 200, { activity: await options.services.buddy.listActivity() });
          return;
        }
        if (request.method === "POST") {
          if (!pairedOrigin) throw new HttpInputError(403, "origin-not-allowed");
          const body = await readJson(request);
          await options.services.buddy.appendActivity({ token: bearerToken(request), origin: pairedOrigin }, body.activity);
          noContent(response);
          return;
        }
        if (request.method === "DELETE") {
          if (!origin) throw new HttpInputError(403, "origin-not-allowed");
          await readJson(request);
          await options.services.buddy.clearActivity();
          noContent(response);
          return;
        }
      }
      if (url.pathname === "/api/buddy/captures" && request.method === "GET") {
        if (!origin) throw new HttpInputError(403, "origin-not-allowed");
        json(response, 200, { captures: await options.services.buddy.listCaptures() });
        return;
      }
      if (url.pathname === "/api/buddy/captures" && request.method === "POST") {
        if (!pairedOrigin) throw new HttpInputError(403, "origin-not-allowed");
        const body = await readJson(request);
        json(response, 201, { capture: await options.services.buddy.addCapture({ token: bearerToken(request), origin: pairedOrigin }, body.capture) });
        return;
      }
      if (request.method === "DELETE" && url.pathname.startsWith("/api/buddy/captures/")) {
        if (!origin) throw new HttpInputError(403, "origin-not-allowed");
        await readJson(request);
        const id = decodeURIComponent(url.pathname.slice("/api/buddy/captures/".length));
        if (!id || id.length > 200 || id.includes("/")) throw new HttpInputError(400, "invalid-capture-id");
        await options.services.buddy.deleteCapture(id);
        noContent(response);
        return;
      }
      if (url.pathname === "/api/buddy/salary-evidence" && request.method === "GET") {
        if (!origin) throw new HttpInputError(403, "origin-not-allowed");
        json(response, 200, { evidence: await options.services.buddy.listSalaryEvidence() });
        return;
      }
      if (url.pathname === "/api/buddy/salary-evidence" && request.method === "POST") {
        if (!pairedOrigin) throw new HttpInputError(403, "origin-not-allowed");
        const body = await readJson(request);
        json(response, 201, { evidence: await options.services.buddy.addSalaryEvidence({ token: bearerToken(request), origin: pairedOrigin }, body.evidence) });
        return;
      }
      if (request.method === "DELETE" && url.pathname.startsWith("/api/buddy/salary-evidence/")) {
        if (!origin) throw new HttpInputError(403, "origin-not-allowed");
        await readJson(request);
        const id = decodeURIComponent(url.pathname.slice("/api/buddy/salary-evidence/".length));
        if (!id || id.length > 200 || id.includes("/")) throw new HttpInputError(400, "invalid-salary-evidence-id");
        await options.services.buddy.deleteSalaryEvidence(id);
        noContent(response);
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
