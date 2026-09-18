import type { DetectedField } from "../../../src/domain/buddy";
import { matchField } from "../matching/matchFields";
import type { AdapterField, FillResult } from "./types";

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement;

export function scanControls(document: Document): AdapterField[] {
  const seen = new Map<string, number>();
  const fields = [...document.querySelectorAll<FormControl>("input, select, textarea, button[type='submit'], input[type='submit']")]
    .filter(isEditable)
    .map((element, index) => toAdapterField(document, element, index))
    .map((field) => {
      const occurrence = (seen.get(field.id) ?? 0) + 1;
      seen.set(field.id, occurrence);
      return occurrence === 1 ? field : { ...field, id: `${field.id}--${occurrence}` };
    });
  const pathCounts = new Map<string, number>();
  for (const field of fields) if (field.canonicalPath) pathCounts.set(field.canonicalPath, (pathCounts.get(field.canonicalPath) ?? 0) + 1);
  return fields.map((field) => field.canonicalPath && (pathCounts.get(field.canonicalPath) ?? 0) > 1
    ? { ...field, canonicalPath: undefined, risk: "manual", reason: "repeated-field-context" } : field);
}

export function fillControl(field: AdapterField, value: string | number | boolean | string[]): FillResult {
  if (field.element.getAttribute("role") === "combobox" && !(field.element instanceof HTMLSelectElement)) return { ok: false, reason: "custom-selection-required" };
  if (field.risk === "manual" || field.element instanceof HTMLButtonElement) return { ok: false, reason: "manual-only-field" };
  const element = field.element;
  if (!isEditable(element)) return { ok: false, reason: "field-unavailable" };
  if (element instanceof HTMLInputElement && ["file", "password", "submit", "checkbox", "radio"].includes(element.type)) {
    return { ok: false, reason: "manual-only-field" };
  }

  const text = Array.isArray(value) ? value.join(", ") : String(value);
  let expected = text;
  if (element instanceof HTMLSelectElement) {
    const normalized = normalize(text);
    const option = [...element.options].find((candidate) => !candidate.disabled && !candidate.closest("optgroup[disabled]") && (normalize(candidate.value) === normalized || normalize(candidate.text) === normalized));
    if (!option) return { ok: false, reason: "select-option-not-found" };
    expected = option.value;
    setNativeValue(element, option.value);
  } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    setNativeValue(element, text);
  } else return { ok: false, reason: "unsupported-control" };

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new FocusEvent("blur", { bubbles: false }));
  return element.isConnected && element.value === expected ? { ok: true } : { ok: false, reason: "page-rejected-value" };
}

export function snapshotFields(fields: readonly AdapterField[]) {
  return Object.fromEntries(fields.map((field) => [field.id, {
    fingerprint: field.fingerprint,
    currentValuePresent: hasCurrentValue(field.element),
    // Ephemeral local comparison only: never sent to the worker or activity log.
    value: field.element.value,
  }]));
}

export function hasStrongConfirmation(document: Document): boolean {
  const marked = document.querySelector("[data-job-buddy-confirmation], [data-qa='application-success'], [data-automation-id='applicationSubmitted']");
  if (marked && confirmationText(marked.textContent ?? "")) return true;
  return [...document.querySelectorAll("h1, h2, [role='status']")]
    .some((element) => confirmationText(element.textContent ?? ""));
}

function confirmationText(value: string): boolean {
  return /^(application (?:submitted|received|complete)|thank you for applying)[.!]?$/i.test(value.replace(/\s+/g, " ").trim());
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
  if (hasHistoricalContext(element)) return { ...matched, canonicalPath: undefined, risk: "manual", reason: "historical-or-other-person-context", element, fingerprint: fingerprint(element, label) };
  // Changing a combobox input's text does not commit its selected option/model.
  if (element.getAttribute("role") === "combobox" && !(element instanceof HTMLSelectElement)) return { ...matched, canonicalPath: undefined, risk: "manual", reason: "custom-selection-required", element, fingerprint: fingerprint(element, label) };
  return { ...matched, element, fingerprint: fingerprint(element, label) };
}

function hasHistoricalContext(element: FormControl): boolean {
  for (let scope = element.parentElement; scope && scope.tagName !== "BODY"; scope = scope.parentElement) {
    const heading = scope.matches("fieldset, section, [role='group']")
      ? scope.querySelector(":scope > legend, :scope > h2, :scope > h3, :scope > h4")?.textContent ?? "" : "";
    const labelled = (scope.getAttribute("aria-labelledby") ?? "").split(/\s+/).map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "").join(" ");
    const context = `${heading} ${labelled} ${scope.getAttribute("aria-label") ?? ""} ${scope.getAttribute("data-automation-id") ?? ""}`.replace(/([a-z])([A-Z])/g, "$1 $2");
    if (/\b(education|employment|work experience|work history|reference|references|referee|emergency contact|school|university)\b/i.test(context)) return true;
  }
  return false;
}

function resolveLabel(document: Document, element: FormControl): string {
  // Follow accessible-name precedence: Oracle's dial-code input also carries
  // the enclosing "Phone Number" label, but aria-labelledby identifies its purpose.
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(" ");
    if (text) return text;
  }
  const ariaLabel = element.getAttribute("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;
  if ("labels" in element && element.labels?.length) {
    const text = [...element.labels].map((label) => {
      const copy = label.cloneNode(true) as HTMLElement;
      copy.querySelectorAll("input, select, textarea, button").forEach((control) => control.remove());
      return copy.textContent?.trim();
    }).filter(Boolean).join(" ");
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

function isEditable(element: FormControl): boolean {
  if (!element.isConnected || element.matches(":disabled, [readonly]") || inputType(element) === "hidden") return false;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.hidden || node.hasAttribute("inert") || node.getAttribute("aria-hidden") === "true") return false;
    const style = (element.ownerDocument.defaultView ?? window).getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
  }
  return true;
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
