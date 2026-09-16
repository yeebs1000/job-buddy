import { fillControl, scanControls } from "./dom";
import type { FormAdapter } from "./types";

export function isGreenhouse(document: Document, url: URL): boolean {
  const stableDomMarker = Boolean(document.querySelector("#grnhse_app, form[data-source='greenhouse']"));
  const stableHost = url.hostname === "boards.greenhouse.io" || url.hostname.endsWith(".greenhouse.io");
  return stableDomMarker && stableHost;
}

export function createGreenhouseAdapter(document: Document): FormAdapter {
  return { id: "greenhouse", scan: () => scanControls(document), fill: fillControl };
}
