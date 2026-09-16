import { fieldCategory, type BuddyPreferences, type ExtensionRequest, type ExtensionResponse } from "../../src/domain/buddy";
import type { ProfileSelection } from "../../src/domain/profile";
import { selectAdapter, type AdapterField, type FormAdapter } from "./adapters/types";
import { snapshotFields } from "./adapters/dom";
import { planFill, type FieldSnapshot } from "./matching/planFill";
import { BuddyPanel } from "./ui/BuddyPanel";

export interface ContentRuntimeDependencies {
  document: Document;
  sendMessage(message: ExtensionRequest): Promise<ExtensionResponse>;
  url?: URL;
  observeMutations?: boolean;
}

export interface ContentRuntime { panel: BuddyPanel; destroy(): void; }

const runtimes = new WeakMap<Document, Promise<ContentRuntime>>();

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
}

async function start({ document: pageDocument, sendMessage, url, observeMutations = true }: ContentRuntimeDependencies): Promise<ContentRuntime> {
  const pageUrl = url ?? new URL(pageDocument.location.href);
  const controller = new AbortController();
  let state: ScanState | undefined;
  let observer: MutationObserver | undefined;
  let rescanTimer: ReturnType<typeof setTimeout> | undefined;
  let lastScanAt = 0;
  const panel = new BuddyPanel(pageDocument.body, {
    onPair: async (code) => {
      const result = await sendMessage({ version: 1, type: "pair", code });
      if (result.ok) await scanAndRender();
      else panel.render({ state: "error", message: "Pairing failed. Create a new code and try again." });
    },
    onFillApproved: async (fieldIds) => fillApproved(fieldIds),
  });
  const status = await sendMessage({ version: 1, type: "status" });
  if (status.ok && status.type === "status" && status.paired) await scanAndRender();
  else panel.render({ state: "unpaired" });

  if (observeMutations && pageDocument.defaultView) {
    observer = new pageDocument.defaultView.MutationObserver(() => scheduleRescan());
    observer.observe(pageDocument.body, { childList: true, subtree: true });
    pageDocument.defaultView.addEventListener("pagehide", destroy, { once: true });
  }
  return { panel, destroy };

  async function scanAndRender(): Promise<void> {
    if (controller.signal.aborted) return;
    lastScanAt = Date.now();
    const preferenceResponse = await sendMessage({ version: 1, type: "get-preferences" });
    if (!preferenceResponse.ok || preferenceResponse.type !== "preferences") return showError("Buddy preferences are unavailable.");
    const preferences = preferenceResponse.preferences;
    if (preferences.paused) return showError("Buddy is paused in Settings.");

    const adapter = selectAdapter(pageDocument, pageUrl);
    const fields = adapter.scan();
    const paths = [...new Set(fields.flatMap((field) => field.canonicalPath ? [field.canonicalPath] : []))];
    let selections: ProfileSelection = {};
    if (paths.length) {
      const response = await sendMessage({ version: 1, type: "select-profile", paths });
      if (!response.ok || response.type !== "profile-selection") return showError("Your local profile could not be read.");
      selections = response.selection;
    }
    if (controller.signal.aborted) return;
    const snapshots = snapshotFields(fields);
    state = { adapter, fields, selections, snapshots, preferences, autoFilled: 0 };
    if (preferences.mode === "automatic") {
      const decisions = planFill({ mode: preferences.mode, paused: false, fields, selections, expectedSnapshots: snapshots, currentSnapshots: snapshotFields(adapter.scan()) });
      for (const decision of decisions) if (decision.action === "fill") await fillOne(decision.fieldId, "safe-high-confidence");
    }
    renderState();
  }

  async function fillApproved(fieldIds: readonly string[]): Promise<void> {
    if (!state || controller.signal.aborted) return;
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
    for (const decision of decisions) if (decision.action === "fill") await fillOne(decision.fieldId, "user-approved", currentFields);
    renderState(new Set(fieldIds));
  }

  async function fillOne(fieldId: string, reason: string, currentFields = state?.adapter.scan() ?? []): Promise<void> {
    if (!state) return;
    const original = state.fields.find((field) => field.id === fieldId);
    const current = currentFields.find((field) => field.id === fieldId);
    if (!original || !current || current.fingerprint !== original.fingerprint || current.currentValuePresent !== original.currentValuePresent || !original.canonicalPath) return;
    const value = state.selections[original.canonicalPath];
    if (value === undefined || !state.adapter.fill(current, value).ok) return;
    state.autoFilled += 1;
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

  function renderState(excluded = new Set<string>()): void {
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
    const reviewIds = new Set(decisions.filter((decision) => decision.action === "review" && !excluded.has(decision.fieldId)).map((decision) => decision.fieldId));
    const reviewFields = state.fields.filter((field) => reviewIds.has(field.id) && field.canonicalPath && state?.selections[field.canonicalPath] !== undefined)
      .map((field) => ({ id: field.id, label: field.label, risk: field.risk === "review" ? "review" as const : "safe" as const }));
    panel.render({
      state: "review",
      mode: state.preferences.mode,
      matched: state.fields.filter((field) => field.canonicalPath).length,
      manual: decisions.filter((decision) => decision.action === "manual").length,
      autoFilled: state.autoFilled,
      fields: reviewFields,
    });
  }

  function showError(message: string): void { panel.render({ state: "error", message }); }

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
    panel.host.remove();
  }
}

if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage && typeof document !== "undefined") {
  void mountContentRuntime({ document, sendMessage: (message) => chrome.runtime.sendMessage(message) as Promise<ExtensionResponse> });
}
