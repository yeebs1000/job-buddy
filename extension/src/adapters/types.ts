import type { AdapterId, DetectedField } from "../../../src/domain/buddy";
import type { ProfileValue } from "../../../src/domain/profile";
import { createGenericAdapter } from "./generic";
import { createGreenhouseAdapter, isGreenhouse } from "./greenhouse";

export type AdapterElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement;
export type AdapterField = DetectedField & { element: AdapterElement; fingerprint: string };
export type FillResult = { ok: true } | { ok: false; reason: string };

export interface FormAdapter {
  id: AdapterId;
  scan(): AdapterField[];
  fill(field: AdapterField, value: ProfileValue): FillResult;
}

export function selectAdapter(document: Document, url: URL): FormAdapter {
  return isGreenhouse(document, url) ? createGreenhouseAdapter(document) : createGenericAdapter(document);
}
