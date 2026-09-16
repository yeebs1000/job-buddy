import { fillControl, scanControls } from "./dom";
import type { FormAdapter } from "./types";

export function isLever(document: Document, url: URL): boolean {
  return (url.hostname === "jobs.lever.co" || url.hostname.endsWith(".jobs.lever.co"))
    && Boolean(document.querySelector("form[data-qa='application-form']"));
}

export function createLeverAdapter(document: Document): FormAdapter {
  return { id: "lever", scan: () => scanControls(document), fill: fillControl };
}
