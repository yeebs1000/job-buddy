import type { DetectedField } from "../../../src/domain/buddy";
import { matchField } from "../matching/matchFields";
import type { AdapterField, FillResult } from "./types";

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement;

export function scanControls(document: Document): AdapterField[] {
  return [...document.querySelectorAll<FormControl>("input, select, textarea, button[type='submit'], input[type='submit']")]
    .filter((element) => !element.disabled && inputType(element) !== "hidden")
    .map((element, index) => toAdapterField(document, element, index));
}

export function fillControl(field: AdapterField, value: string | number | boolean | string[]): FillResult {
  if (field.risk === "manual" || field.element instanceof HTMLButtonElement) return { ok: false, reason: "manual-only-field" };
  const element = field.element;
  if (element instanceof HTMLInputElement && ["file", "password", "submit", "checkbox", "radio"].includes(element.type)) {
    return { ok: false, reason: "manual-only-field" };
  }

  const text = Array.isArray(value) ? value.join(", ") : String(value);
  if (element instanceof HTMLSelectElement) {
    const normalized = normalize(text);
    const option = [...element.options].find((candidate) => normalize(candidate.value) === normalized || normalize(candidate.text) === normalized);
    if (!option) return { ok: false, reason: "select-option-not-found" };
    setNativeValue(element, option.value);
  } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    setNativeValue(element, text);
  } else return { ok: false, reason: "unsupported-control" };

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new FocusEvent("blur", { bubbles: false }));
  return { ok: true };
}

export function snapshotFields(fields: readonly AdapterField[]) {
  return Object.fromEntries(fields.map((field) => [field.id, {
    fingerprint: field.fingerprint,
    currentValuePresent: hasCurrentValue(field.element),
  }]));
}

function toAdapterField(document: Document, element: FormControl, index: number): AdapterField {
  const label = resolveLabel(document, element);
  const id = element.id || element.getAttribute("name") || `job-buddy-field-${index}`;
  const matched = matchField({
    id,
    label,
    kind: fieldKind(element),
    required: element.hasAttribute("required") || element.getAttribute("aria-required") === "true",
    currentValuePresent: hasCurrentValue(element),
    autocomplete: element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.autocomplete : undefined,
    name: element.getAttribute("name") ?? "",
    helpText: describedByText(document, element),
    inputType: inputType(element),
  });
  return { ...matched, element, fingerprint: fingerprint(element, label) };
}

function resolveLabel(document: Document, element: FormControl): string {
  if ("labels" in element && element.labels?.length) {
    const text = [...element.labels].map((label) => label.textContent?.trim()).filter(Boolean).join(" ");
    if (text) return text;
  }
  const ariaLabel = element.getAttribute("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(" ");
    if (text) return text;
  }
  const ownText = element.textContent?.trim();
  if (ownText) return ownText;
  return element.getAttribute("name")?.replace(/[_-]+/g, " ").trim() || element.id.replace(/[_-]+/g, " ").trim() || "Application field";
}

function describedByText(document: Document, element: FormControl): string {
  return (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(" ");
}

function fieldKind(element: FormControl): DetectedField["kind"] {
  if (element instanceof HTMLTextAreaElement) return "textarea";
  if (element instanceof HTMLSelectElement) return "select";
  if (element instanceof HTMLButtonElement) return "other";
  if (["email", "tel", "url", "radio", "checkbox", "file"].includes(element.type)) return element.type as DetectedField["kind"];
  return ["text", "password", "number", "date", "month"].includes(element.type) ? "text" : "other";
}

function inputType(element: FormControl): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLButtonElement) return element.type.toLowerCase();
  return element.tagName.toLowerCase();
}

function hasCurrentValue(element: FormControl): boolean {
  if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) return element.checked;
  if (element instanceof HTMLInputElement && element.type === "file") return Boolean(element.files?.length);
  if (element instanceof HTMLButtonElement) return false;
  return element.value.trim().length > 0;
}

function fingerprint(element: FormControl, label: string): string {
  return [element.tagName.toLowerCase(), inputType(element), element.id, element.getAttribute("name") ?? "", normalize(label)].join("|");
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype
    : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw new Error("native-value-setter-unavailable");
  setter.call(element, value);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
