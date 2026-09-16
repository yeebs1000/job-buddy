import type { AdapterId, DetectedField } from "../../../src/domain/buddy";
import type { ProfileValue } from "../../../src/domain/profile";
import { createGenericAdapter } from "./generic";
import { createGreenhouseAdapter, isGreenhouse } from "./greenhouse";
import { createLeverAdapter, isLever } from "./lever";
import { createOracleAdapter, isOracle } from "./oracle";
import { createWorkdayAdapter, isWorkday } from "./workday";

export type AdapterElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement;
export type AdapterField = DetectedField & { element: AdapterElement; fingerprint: string };
export type FillResult = { ok: true } | { ok: false; reason: string };

export interface FormAdapter {
  id: AdapterId;
  scan(): AdapterField[];
  fill(field: AdapterField, value: ProfileValue): FillResult;
}

export function selectAdapter(document: Document, url: URL): FormAdapter {
  if (isGreenhouse(document, url)) return createGreenhouseAdapter(document);
  if (isWorkday(document, url)) return createWorkdayAdapter(document);
  if (isOracle(document, url)) return createOracleAdapter(document);
  if (isLever(document, url)) return createLeverAdapter(document);
  return createGenericAdapter(document);
}
