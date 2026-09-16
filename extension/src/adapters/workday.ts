import { fillControl, scanControls } from "./dom";
import type { FormAdapter } from "./types";

export function isWorkday(document: Document, url: URL): boolean {
  return url.hostname.endsWith(".myworkdayjobs.com")
    && Boolean(document.querySelector("[data-automation-id='jobApplicationPage']"));
}

export function createWorkdayAdapter(document: Document): FormAdapter {
  return { id: "workday", scan: () => scanControls(document), fill: fillControl };
}
