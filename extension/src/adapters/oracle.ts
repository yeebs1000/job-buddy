import { fillControl, hasStrongConfirmation, scanControls } from "./dom";
import type { FormAdapter } from "./types";

export function isOracle(document: Document, url: URL): boolean {
  return url.hostname.endsWith(".oraclecloud.com")
    && (Boolean(document.querySelector("#candidate-experience[data-oj-context], #candidate-experience [data-oj-context]"))
      || (/^\/hcmUI\/CandidateExperience\//.test(url.pathname)
        && Boolean(document.querySelector("main[aria-labelledby='apply-flow-main-heading'] form.apply-flow__content-form apply-flow-section"))));
}

export function createOracleAdapter(document: Document): FormAdapter {
  return { id: "oracle", scan: () => scanControls(document), fill: fillControl, confirmed: () => hasStrongConfirmation(document) };
}
