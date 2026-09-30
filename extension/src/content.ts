import { fieldCategory, type AdapterId, type BuddyPreferences, type ExtensionRequest, type ExtensionResponse, type PendingCapture, type PendingSalaryEvidence } from "../../src/domain/buddy";
import type { Market } from "../../src/domain/research";
import type { ProfileSelection } from "../../src/domain/profile";
import { selectAdapter, type AdapterField, type FormAdapter } from "./adapters/types";
import { snapshotFields } from "./adapters/dom";
import { planFill, type FieldSnapshot } from "./matching/planFill";
import { BuddyPanel } from "./ui/BuddyPanel";
import { detectSalary, detectSalaryJsonLd } from "./research/detectSalary";

export interface ContentRuntimeDependencies {
  document: Document;
  sendMessage(message: ExtensionRequest): Promise<ExtensionResponse>;
  url?: URL;
  observeMutations?: boolean;
  allowUntrustedSubmitForTest?: boolean;
  intentStore?: IntentStore;
}

export interface IntentStore { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void; }
export interface ContentRuntime { panel: BuddyPanel; rescan(): Promise<void>; destroy(): void; }

// Survives repeated bundle injection in Chrome's isolated content-script world.
const runtimeScope = globalThis as typeof globalThis & { __jobBuddyRuntimes?: WeakMap<Document, Promise<ContentRuntime>> };
const runtimes = runtimeScope.__jobBuddyRuntimes ??= new WeakMap<Document, Promise<ContentRuntime>>();

export function mountContentRuntime(dependencies: ContentRuntimeDependencies): Promise<ContentRuntime> {
  const existing = runtimes.get(dependencies.document);
  if (existing) return existing;
  const runtime = start(dependencies);
  runtimes.set(dependencies.document, runtime);
  return runtime;
}

interface ScanState {
  adapter: FormAdapter;
  fields: AdapterField[];
  selections: ProfileSelection;
  snapshots: Readonly<Record<string, FieldSnapshot>>;
  preferences: BuddyPreferences;
  autoFilled: number;
  filled: Set<string>;
  message?: string;
}

interface SubmitIntent {
  adapter: AdapterId;
  company: string;
  role: string;
  location: string;
  sourceUrl: string;
  submittedAt: string;
  completionId: string;
}

const intentKey = "job-buddy-submit-intent-v1";

async function start({ document: pageDocument, sendMessage, url, observeMutations = true, allowUntrustedSubmitForTest = false, intentStore: suppliedIntentStore }: ContentRuntimeDependencies): Promise<ContentRuntime> {
  const pageUrl = url ?? new URL(pageDocument.location.href);
  const intentStore = suppliedIntentStore ?? browserIntentStore(pageDocument);
  const controller = new AbortController();
  let state: ScanState | undefined;
  let observer: MutationObserver | undefined;
  let rescanTimer: ReturnType<typeof setTimeout> | undefined;
  let lastScanAt = 0;
  let pendingCapture: PendingCapture | undefined;
  let pendingSalaryEvidence: PendingSalaryEvidence | undefined;
  let operation = Promise.resolve();
  const panel = new BuddyPanel(pageDocument.body, {
    onPair: (code) => enqueue(async () => {
      const result = await sendMessage({ version: 1, type: "pair", code });
      if (result.ok) await scan();
      else panel.render({ state: "unpaired", message: result.error === "companion-offline"
        ? "The extension could not reach the local companion. Keep npm.cmd run dev running, reload the extension, then retry pairing."
        : result.error === "origin-not-allowed"
          ? "The local companion rejected this extension connection. Restart Job Buddy and reload the updated extension, then retry."
          : result.error === "invalid-pairing"
            ? "This code expired, was replaced, or no longer matches this app session. Create a fresh code in Settings and use it within five minutes."
            : "Pairing could not finish. Check that the app and extension are up to date, then retry with a fresh code." });
    }),
    onFillApproved: (fieldIds) => {
      const reviewedState = state;
      return enqueue(async () => {
        if (!reviewedState || reviewedState !== state) {
          if (state) { state.message = "The form changed during scanning. Review the latest answers and select them again."; renderState(); }
          return;
        }
        await fillApproved(fieldIds);
      });
    },
    onRescan: () => scanAndRender(),
    onReviewSalary: () => { if (pendingSalaryEvidence) panel.render({ state: "salary-evidence", evidence: pendingSalaryEvidence }); },
    onSendCapture: async () => sendCapture(),
    onSendSalaryEvidence: async (evidence) => sendSalaryEvidence(evidence),
  });
  const submitListener = (event: Event) => {
    if (!(event.target instanceof HTMLFormElement) || !event.isTrusted && !allowUntrustedSubmitForTest || !state) return;
    const form = event.target;
    const submittedAt = new Date().toISOString();
    const intent: SubmitIntent = {
      adapter: state.adapter.id,
      company: metadataValue(form, pageDocument, "company") || pageUrl.hostname,
      role: pageDocument.querySelector("h1")?.textContent?.trim().slice(0, 300) || "Role to review",
      location: metadataValue(form, pageDocument, "location") || "Location to review",
      sourceUrl: sanitizedUrl(pageUrl),
      submittedAt,
      completionId: `${state.adapter.id}-${Date.now()}-${stableFingerprint(sanitizedUrl(pageUrl))}`,
    };
    intentStore.set(intentKey, JSON.stringify(intent));
  };
  pageDocument.addEventListener("submit", submitListener, true);
  await enqueue(async () => {
    const status = await sendMessage({ version: 1, type: "status" });
    if (status.ok && status.type === "status" && status.paired) await scan();
    else if (status.ok || status.error === "unpaired") panel.render({ state: "unpaired" });
    else showError("Buddy could not reach the local companion. Keep Job Buddy running, then scan this page again.");
  });

  if (observeMutations && pageDocument.defaultView) {
    observer = new pageDocument.defaultView.MutationObserver(() => scheduleRescan());
    observer.observe(pageDocument.body, { childList: true, subtree: true });
    pageDocument.defaultView.addEventListener("pagehide", destroy, { once: true });
  }
  return { panel, rescan: scanAndRender, destroy };

  async function scanAndRender(): Promise<void> {
    return enqueue(scan);
  }

  function enqueue(task: () => Promise<void>): Promise<void> {
    operation = operation.then(async () => { if (!controller.signal.aborted) await task(); }).catch(() => {
      state = undefined;
      if (!controller.signal.aborted) showError("Buddy could not reach the local companion. Keep Job Buddy running, then scan this page again.");
    });
    return operation;
  }

  async function scan(): Promise<void> {
    if (controller.signal.aborted) return;
    lastScanAt = Date.now();
    const preferenceResponse = await sendMessage({ version: 1, type: "get-preferences" });
    if (!preferenceResponse.ok && preferenceResponse.error === "unpaired") return panel.render({ state: "unpaired" });
    if (!preferenceResponse.ok || preferenceResponse.type !== "preferences") return showError("Buddy preferences are unavailable.");
    const preferences = preferenceResponse.preferences;
    if (preferences.paused) return showError("Buddy is paused in Settings.");

    const adapter = selectAdapter(pageDocument, pageUrl);
    const fields = adapter.scan();
    const snapshots = snapshotFields(fields);
    const paths = [...new Set(fields.flatMap((field) => field.canonicalPath ? [field.canonicalPath] : []))];
    let selections: ProfileSelection = {};
    if (paths.length) {
      const response = await sendMessage({ version: 1, type: "select-profile", paths });
      if (!response.ok || response.type !== "profile-selection") return showError("Your local profile could not be read.");
      selections = response.selection;
    }
    if (controller.signal.aborted) return;
    state = { adapter, fields, selections, snapshots, preferences, autoFilled: 0, filled: new Set() };
    if (preferences.mode === "automatic") {
      const decisions = planFill({ mode: preferences.mode, paused: false, fields, selections, expectedSnapshots: snapshots, currentSnapshots: snapshotFields(adapter.scan()) });
      for (const decision of decisions) if (decision.action === "fill") await fillOne(decision.fieldId, "safe-high-confidence");
    }
    detectSalaryEvidence();
    if (fields.length || !pendingSalaryEvidence) renderState();
    detectCapture(adapter);
  }

  async function fillApproved(fieldIds: readonly string[]): Promise<void> {
    if (!state || controller.signal.aborted) return;
    const preferenceResponse = await sendMessage({ version: 1, type: "get-preferences" });
    if (!preferenceResponse.ok || preferenceResponse.type !== "preferences") return showError("Buddy preferences are unavailable. Nothing was filled; scan again to retry.");
    state.preferences = preferenceResponse.preferences;
    if (state.preferences.paused) return showError("Buddy is paused in Settings. Nothing was filled.");
    const currentFields = state.adapter.scan();
    const decisions = planFill({
      mode: "approval",
      paused: state.preferences.paused,
      fields: state.fields,
      selections: state.selections,
      expectedSnapshots: state.snapshots,
      currentSnapshots: snapshotFields(currentFields),
      approvedFieldIds: fieldIds,
    });
    const changed = decisions.some((decision) => fieldIds.includes(decision.fieldId) && decision.action === "blocked");
    state.message = changed ? "Some fields changed since scanning. Scan this page again before approving them." : undefined;
    for (const decision of decisions) if (decision.action === "fill") await fillOne(decision.fieldId, "user-approved");
    renderState();
  }

  async function fillOne(fieldId: string, reason: string, currentFields = state?.adapter.scan() ?? []): Promise<void> {
    if (!state) return;
    const original = state.fields.find((field) => field.id === fieldId);
    const current = currentFields.find((field) => field.id === fieldId);
    if (!original || !current || current.element !== original.element || current.fingerprint !== original.fingerprint || state.snapshots[fieldId]?.value !== current.element.value || !original.canonicalPath) {
      state.message = "Some fields changed since scanning. Scan this page again before approving them.";
      return;
    }
    const value = state.selections[original.canonicalPath];
    if (value === undefined || !state.adapter.fill(current, value).ok) {
      state.message = "Some fields could not be filled. Check the available options or enter those answers manually.";
      return;
    }
    state.autoFilled += 1;
    state.filled.add(fieldId);
    await sendMessage({ version: 1, type: "record-activity", activity: {
      id: `${Date.now()}-${fieldId.slice(0, 100)}`,
      fieldCategory: fieldCategory(original.canonicalPath),
      disposition: "filled",
      reason,
      mode: state.preferences.mode,
      adapter: state.adapter.id,
      domain: pageUrl.hostname,
      at: new Date().toISOString(),
    } });
  }

  function renderState(): void {
    if (!state) return;
    const currentSnapshots = snapshotFields(state.adapter.scan());
    const decisions = planFill({
      mode: state.preferences.mode,
      paused: state.preferences.paused,
      fields: state.fields,
      selections: state.selections,
      expectedSnapshots: state.snapshots,
      currentSnapshots,
    });
    const reviewIds = new Set(decisions.filter((decision) => ["review", "fill"].includes(decision.action) && !state!.filled.has(decision.fieldId)).map((decision) => decision.fieldId));
    const reviewFields = state.fields.filter((field) => reviewIds.has(field.id) && field.canonicalPath && state?.selections[field.canonicalPath] !== undefined)
      .map((field) => ({ id: field.id, label: field.label, risk: field.risk === "review" ? "review" as const : "safe" as const, existingValue: field.currentValuePresent, preview: String(state!.selections[field.canonicalPath!]).slice(0, 300) }));
    const missing = state.fields.filter((field) => field.canonicalPath && state!.selections[field.canonicalPath] === undefined);
    const customSelectors = state.fields.filter((field) => field.reason === "custom-selection-required");
    const guidance = [
      missing.length ? `Some matched fields have no saved answer: ${fieldLabels(missing)}. Add these in Job Buddy Profile, save, then scan again.` : "",
      customSelectors.length ? `Choose these dropdowns directly on the application: ${fieldLabels(customSelectors)}. Buddy cannot select their options yet.` : "",
    ].filter(Boolean).join(" ");
    panel.render({
      state: "review",
      mode: state.preferences.mode,
      matched: state.fields.filter((field) => field.canonicalPath).length,
      manual: state.fields.filter((field) => field.risk === "manual" || !field.canonicalPath).length,
      autoFilled: state.autoFilled,
      fields: reviewFields,
      message: state.message ?? (guidance || (!reviewFields.length && !state.autoFilled ? "No supported profile fields are ready to fill. Open the application form or its next step, then scan again." : undefined)),
      salaryAvailable: Boolean(pendingSalaryEvidence),
    });
  }

  function showError(message: string): void { panel.render({ state: "error", message }); }

  function detectCapture(adapter: FormAdapter): void {
    const intent = readIntent();
    if (!intent || intent.adapter !== adapter.id && adapter.id !== "generic") return;
    const submittedAt = Date.parse(intent.submittedAt);
    if (!Number.isFinite(submittedAt) || Date.now() - submittedAt > 30 * 60 * 1_000) { intentStore.remove(intentKey); return; }
    const navigated = sanitizedUrl(pageUrl) !== intent.sourceUrl;
    if (!adapter.confirmed() && !navigated) return;
    pendingCapture = {
      id: `capture-${stableFingerprint(intent.completionId)}`,
      company: intent.company,
      role: intent.role,
      location: intent.location,
      sourceUrl: intent.sourceUrl,
      platform: intent.adapter,
      detectedAt: new Date().toISOString(),
      completionId: intent.completionId,
    };
    panel.render({ state: "capture", company: pendingCapture.company, role: pendingCapture.role, location: pendingCapture.location });
  }

  async function sendCapture(): Promise<void> {
    if (!pendingCapture) return;
    const response = await sendMessage({ version: 1, type: "queue-capture", capture: pendingCapture });
    if (!response.ok || response.type !== "captured") return showError("The completed application could not be sent to your dashboard.");
    intentStore.remove(intentKey);
    pendingCapture = undefined;
    panel.render({ state: "capture-sent" });
  }

  function detectSalaryEvidence(): void {
    pendingSalaryEvidence = undefined;
    const text = (pageDocument.body.textContent ?? "").slice(0, 200_000);
    const structured = [...pageDocument.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')]
      .map((script) => script.textContent ?? "").join("\n").slice(0, 100_000);
    const market = inferMarket(pageDocument, `${text}\n${structured}`);
    if (!market) return;
    const detected = detectSalary(text, { market }) ?? detectSalaryJsonLd(structured, { market });
    if (!detected) return;
    pendingSalaryEvidence = {
      id: `salary-${stableFingerprint(`${sanitizedUrl(pageUrl)}|${detected.currency}|${detected.minimum}|${detected.maximum}|${detected.period}`)}`,
      market,
      ...detected,
      sourceUrl: sanitizedUrl(pageUrl),
      detectedAt: new Date().toISOString(),
    };
    panel.render({ state: "salary-evidence", evidence: pendingSalaryEvidence });
  }

  async function sendSalaryEvidence(evidence: PendingSalaryEvidence): Promise<void> {
    if (!pendingSalaryEvidence || evidence.id !== pendingSalaryEvidence.id) return;
    const response = await sendMessage({ version: 1, type: "queue-salary-evidence", evidence });
    if (!response.ok || response.type !== "salary-evidence-captured") return showError("Salary evidence could not be sent to your dashboard.");
    pendingSalaryEvidence = undefined;
    panel.render({ state: "salary-evidence-sent" });
  }

  function readIntent(): SubmitIntent | undefined {
    try {
      const value = intentStore.get(intentKey);
      if (!value) return undefined;
      const parsed = JSON.parse(value) as Partial<SubmitIntent>;
      if (!parsed || typeof parsed !== "object" || typeof parsed.company !== "string" || typeof parsed.role !== "string"
        || typeof parsed.location !== "string" || typeof parsed.sourceUrl !== "string" || typeof parsed.submittedAt !== "string"
        || typeof parsed.completionId !== "string" || !["generic", "greenhouse", "workday", "oracle", "lever"].includes(parsed.adapter ?? "")) return undefined;
      return parsed as SubmitIntent;
    } catch { return undefined; }
  }

  function scheduleRescan(): void {
    if (controller.signal.aborted || rescanTimer) return;
    const delay = Math.max(250, 1_000 - (Date.now() - lastScanAt));
    rescanTimer = setTimeout(() => { rescanTimer = undefined; void scanAndRender(); }, delay);
  }

  function destroy(): void {
    if (controller.signal.aborted) return;
    controller.abort();
    observer?.disconnect();
    if (rescanTimer) clearTimeout(rescanTimer);
    pageDocument.removeEventListener("submit", submitListener, true);
    panel.host.remove();
    runtimes.delete(pageDocument);
  }
}

function browserIntentStore(document: Document): IntentStore {
  try {
    const storage = document.defaultView?.sessionStorage;
    if (storage) return { get: (key) => storage.getItem(key), set: (key, value) => storage.setItem(key, value), remove: (key) => storage.removeItem(key) };
  } catch { /* Some application pages block storage; capture stays disabled without weakening autofill. */ }
  return { get: () => null, set: () => undefined, remove: () => undefined };
}

function metadataValue(form: HTMLFormElement, document: Document, name: "company" | "location"): string {
  const direct = form.dataset[name]?.trim();
  if (direct) return direct.slice(0, 300);
  const element = document.querySelector<HTMLElement>(`[data-${name}]`);
  return (element?.dataset[name] || element?.textContent || "").trim().slice(0, 300);
}

function sanitizedUrl(url: URL): string { return `${url.origin}${url.pathname}`; }

function fieldLabels(fields: readonly AdapterField[]): string {
  const labels = [...new Set(fields.map((field) => field.label.replace(/\s+/g, " ").trim().slice(0, 70)))];
  return labels.slice(0, 5).join(", ") + (labels.length > 5 ? `, and ${labels.length - 5} more` : "");
}

function stableFingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(36);
}

function inferMarket(document: Document, text: string): Market | undefined {
  if (/\b(?:SGD|S\$)/iu.test(text)) return "SG";
  if (/\b(?:HKD|HK\$)/iu.test(text)) return "HK";
  if (/\b(?:USD|US\$)/iu.test(text)) return "US";
  const location = [...document.querySelectorAll<HTMLElement>("[data-location]")]
    .map((element) => element.dataset.location ?? element.textContent ?? "").join(" ");
  return /\b(?:United States|USA|U\.S\.)\b/iu.test(location) ? "US" : undefined;
}

if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage && typeof document !== "undefined") {
  void mountContentRuntime({ document, sendMessage: (message) => chrome.runtime.sendMessage(message) as Promise<ExtensionResponse> });
}
