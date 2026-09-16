import type { ExtensionRequest, ExtensionResponse } from "../../src/domain/buddy";
import { BuddyPanel } from "./ui/BuddyPanel";

export interface ContentRuntimeDependencies {
  document: Document;
  sendMessage(message: ExtensionRequest): Promise<ExtensionResponse>;
}

export interface ContentRuntime { panel: BuddyPanel; }

const runtimes = new WeakMap<Document, Promise<ContentRuntime>>();

export function mountContentRuntime(dependencies: ContentRuntimeDependencies): Promise<ContentRuntime> {
  const existing = runtimes.get(dependencies.document);
  if (existing) return existing;
  const runtime = start(dependencies);
  runtimes.set(dependencies.document, runtime);
  return runtime;
}

async function start({ document: pageDocument, sendMessage }: ContentRuntimeDependencies): Promise<ContentRuntime> {
  const panel = new BuddyPanel(pageDocument.body, {
    onPair: async (code) => {
      const result = await sendMessage({ version: 1, type: "pair", code });
      panel.render(result.ok ? { state: "idle" } : { state: "error", message: "Pairing failed. Create a new code and try again." });
    },
  });
  const status = await sendMessage({ version: 1, type: "status" });
  panel.render(status.ok && status.type === "status" && status.paired ? { state: "idle" } : { state: "unpaired" });
  return { panel };
}

if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage && typeof document !== "undefined") {
  void mountContentRuntime({ document, sendMessage: (message) => chrome.runtime.sendMessage(message) as Promise<ExtensionResponse> });
}
