import { fillControl, hasStrongConfirmation, scanControls } from "./dom";
import type { FormAdapter } from "./types";

export function isOracle(document: Document, url: URL): boolean {
  return url.hostname.endsWith(".oraclecloud.com")
    && Boolean(document.querySelector("#candidate-experience[data-oj-context], #candidate-experience [data-oj-context]"));
}

export function createOracleAdapter(document: Document): FormAdapter {
  return { id: "oracle", scan: () => scanControls(document), fill: fillControl, confirmed: () => hasStrongConfirmation(document) };
}
