import { fillControl, scanControls } from "./dom";
import type { FormAdapter } from "./types";

export function createGenericAdapter(document: Document): FormAdapter {
  return { id: "generic", scan: () => scanControls(document), fill: fillControl };
}
