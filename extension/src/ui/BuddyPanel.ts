import { buddyStyles } from "./styles";
import type { PendingSalaryEvidence } from "../../../src/domain/buddy";

export type BuddyPanelModel =
  | { state: "unpaired"; message?: string }
  | { state: "idle" }
  | { state: "fields-found"; matched: number; review: number; manual: number }
  | { state: "review"; mode: "approval" | "automatic"; matched: number; manual: number; autoFilled: number; fields: readonly BuddyReviewField[]; message?: string; salaryAvailable?: boolean }
  | { state: "capture"; company: string; role: string; location: string }
  | { state: "capture-sent" }
  | { state: "salary-evidence"; evidence: PendingSalaryEvidence }
  | { state: "salary-evidence-sent" }
  | { state: "error"; message: string };

export interface BuddyReviewField { id: string; label: string; risk: "safe" | "review"; preview?: string; existingValue?: boolean; }
export interface BuddyPanelOptions {
  onPair?: (code: string) => Promise<void> | void;
  onFillApproved?: (fieldIds: string[]) => Promise<void> | void;
  onSendCapture?: () => Promise<void> | void;
  onSendSalaryEvidence?: (evidence: PendingSalaryEvidence) => Promise<void> | void;
  onRescan?: () => Promise<void> | void;
  onReviewSalary?: () => void;
}

export class BuddyPanel {
  readonly host: HTMLDivElement;
  readonly shadowRoot: ShadowRoot;
  expanded = false;
  private model: BuddyPanelModel = { state: "idle" };
  private readonly onPair: (code: string) => Promise<void> | void;
  private readonly onFillApproved: (fieldIds: string[]) => Promise<void> | void;
  private readonly onSendCapture: () => Promise<void> | void;
  private readonly onSendSalaryEvidence: (evidence: PendingSalaryEvidence) => Promise<void> | void;
  private readonly onRescan: () => Promise<void> | void;
  private readonly onReviewSalary: () => void;

  constructor(parent: HTMLElement, options: BuddyPanelOptions = {}) {
    this.host = parent.ownerDocument.createElement("div");
    this.host.dataset.jobBuddy = "panel";
    this.host.dataset.corner = "right";
    this.shadowRoot = this.host.attachShadow({ mode: "open" });
    this.onPair = options.onPair ?? (() => undefined);
    this.onFillApproved = options.onFillApproved ?? (() => undefined);
    this.onSendCapture = options.onSendCapture ?? (() => undefined);
    this.onSendSalaryEvidence = options.onSendSalaryEvidence ?? (() => undefined);
    this.onRescan = options.onRescan ?? (() => undefined);
    this.onReviewSalary = options.onReviewSalary ?? (() => undefined);
    this.shadowRoot.addEventListener("keydown", (event) => { if ((event as KeyboardEvent).key === "Escape") this.collapse(); });
    parent.append(this.host);
    this.draw();
  }

  render(model: BuddyPanelModel): void { this.model = model; this.draw(); }
  setCorner(corner: "left" | "right"): void { this.host.dataset.corner = corner; }
  expand(): void { this.expanded = true; this.draw(); }
  collapse(): void { this.expanded = false; this.draw(); }

  private draw(): void {
    this.shadowRoot.replaceChildren();
    const style = this.host.ownerDocument.createElement("style");
    style.textContent = buddyStyles;
    const anchor = this.host.ownerDocument.createElement("div");
    anchor.className = "anchor";
    if (!this.expanded) {
      const launcher = this.host.ownerDocument.createElement("button");
      launcher.className = "launcher";
      launcher.type = "button";
      launcher.setAttribute("aria-label", "Open Job Buddy");
      launcher.textContent = "Buddy";
      launcher.addEventListener("click", () => this.expand());
      anchor.append(launcher);
    } else anchor.append(this.buildPanel());
    this.shadowRoot.append(style, anchor);
  }

  private buildPanel(): HTMLElement {
    const doc = this.host.ownerDocument;
    const panel = doc.createElement("section");
    panel.className = "panel";
    panel.setAttribute("aria-label", "Job Buddy autofill");
    const header = doc.createElement("header");
    header.className = "header";
    const title = doc.createElement("strong");
    title.textContent = "Job Buddy";
    const close = doc.createElement("button");
    close.className = "close";
    close.type = "button";
    close.setAttribute("aria-label", "Collapse Job Buddy");
    close.textContent = "Close";
    close.addEventListener("click", () => this.collapse());
    header.append(title, close);
    const body = doc.createElement("div");
    body.className = "body";
    this.populateBody(body);
    const rescan = doc.createElement("button");
    rescan.type = "button"; rescan.className = "close"; rescan.dataset.action = "rescan";
    rescan.textContent = "Scan this page again";
    rescan.addEventListener("click", async () => {
      rescan.disabled = true; rescan.textContent = "Scanning…";
      try { await this.onRescan(); } finally { rescan.disabled = false; rescan.textContent = "Scan this page again"; }
    });
    body.append(rescan);
    panel.append(header, body);
    return panel;
  }

  private populateBody(body: HTMLElement): void {
    const doc = this.host.ownerDocument;
    if (this.model.state === "unpaired") {
      const heading = doc.createElement("h2"); heading.textContent = "Pair this browser";
      const copy = doc.createElement("p"); copy.textContent = "Create a one-time code in Job Buddy Settings, then enter it here.";
      if (this.model.message) { copy.textContent = this.model.message; copy.setAttribute("role", "alert"); }
      const form = doc.createElement("form");
      const label = doc.createElement("label"); label.textContent = "Pairing code";
      const input = doc.createElement("input"); input.name = "pairing-code"; input.autocomplete = "off"; input.maxLength = 12;
      const submit = doc.createElement("button"); submit.className = "primary"; submit.type = "submit"; submit.textContent = "Pair Buddy";
      label.append(input); form.append(label, submit);
      form.addEventListener("submit", (event) => { event.preventDefault(); const code = input.value.trim(); if (code) void this.onPair(code); });
      body.append(heading, copy, form);
      return;
    }
    if (this.model.state === "fields-found") {
      const heading = doc.createElement("h2"); heading.textContent = "Application fields found";
      const counts = doc.createElement("div"); counts.className = "counts";
      counts.append(this.count("Matched", this.model.matched), this.count("Review", this.model.review), this.count("Manual", this.model.manual));
      body.append(heading, counts);
      return;
    }
    if (this.model.state === "review") {
      const heading = doc.createElement("h2");
      heading.textContent = this.model.mode === "automatic" ? "Autofill review" : "Choose fields to fill";
      const summary = doc.createElement("p");
      summary.textContent = `${this.model.autoFilled} filled · ${this.model.fields.length} need review · ${this.model.manual} manual`;
      const form = doc.createElement("form");
      form.className = "review-form";
      const list = doc.createElement("div");
      list.className = "review-list";
      for (const field of this.model.fields) {
        const label = doc.createElement("label");
        label.className = "review-field";
        const checkbox = doc.createElement("input");
        checkbox.type = "checkbox";
        checkbox.name = "approved-field";
        checkbox.value = field.id;
        const text = doc.createElement("span");
        text.textContent = field.label;
        const badge = doc.createElement("small");
        badge.textContent = field.preview !== undefined ? `Review answer: ${field.preview}` : field.risk === "review" ? "Check carefully" : "Profile match";
        if (field.existingValue) badge.textContent += " · Replaces an existing answer";
        label.append(checkbox, text, badge);
        list.append(label);
      }
      const submit = doc.createElement("button");
      submit.className = "primary";
      submit.dataset.action = "fill-approved";
      submit.type = "submit";
      submit.textContent = "Fill approved fields";
      submit.disabled = true;
      const updateSubmit = () => { submit.disabled = !form.querySelector('input[name="approved-field"]:checked'); };
      form.addEventListener("change", updateSubmit);
      const selectSafe = doc.createElement("button"); selectSafe.type = "button"; selectSafe.className = "close";
      selectSafe.dataset.action = "select-safe"; selectSafe.textContent = "Select safe, empty fields";
      const safeIds = new Set(this.model.fields.filter((field) => field.risk === "safe" && !field.existingValue).map((field) => field.id));
      selectSafe.disabled = !safeIds.size;
      selectSafe.addEventListener("click", () => {
        for (const input of list.querySelectorAll<HTMLInputElement>('input[name="approved-field"]')) if (safeIds.has(input.value)) input.checked = true;
        updateSubmit();
      });
      form.append(selectSafe, list, submit);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const ids = [...form.querySelectorAll<HTMLInputElement>('input[name="approved-field"]:checked')].map((input) => input.value);
        if (ids.length) {
          submit.disabled = true; submit.textContent = "Filling…";
          try { await this.onFillApproved(ids); } finally { submit.textContent = "Fill approved fields"; updateSubmit(); }
        }
      });
      const guarantee = doc.createElement("small");
      guarantee.className = "guarantee";
      guarantee.textContent = "Buddy never submits applications or fills files, credentials, or demographic fields.";
      body.append(heading, summary, form, guarantee);
      if (this.model.message) {
        const message = doc.createElement("p"); message.setAttribute("role", "status"); message.textContent = this.model.message;
        body.insertBefore(message, form);
      }
      if (this.model.salaryAvailable) {
        const salary = doc.createElement("button"); salary.type = "button"; salary.className = "close";
        salary.dataset.action = "review-salary"; salary.textContent = "Review salary found on this page";
        salary.addEventListener("click", () => this.onReviewSalary()); body.append(salary);
      }
      return;
    }
    if (this.model.state === "capture") {
      const heading = doc.createElement("h2"); heading.textContent = "Application completed?";
      const copy = doc.createElement("p"); copy.textContent = "Review this metadata before sending it to your local tracker.";
      const details = doc.createElement("dl"); details.className = "capture-details";
      for (const [label, value] of [["Company", this.model.company], ["Role", this.model.role], ["Location", this.model.location]]) {
        const row = doc.createElement("div"); const term = doc.createElement("dt"); const description = doc.createElement("dd");
        term.textContent = label; description.textContent = value; row.append(term, description); details.append(row);
      }
      const send = doc.createElement("button"); send.className = "primary"; send.type = "button";
      send.dataset.action = "send-capture"; send.textContent = "Send to Job Buddy";
      send.addEventListener("click", () => void this.onSendCapture());
      const guarantee = doc.createElement("small"); guarantee.textContent = "Only job metadata is sent—never form answers.";
      body.append(heading, copy, details, send, guarantee);
      return;
    }
    if (this.model.state === "capture-sent") {
      const heading = doc.createElement("h2"); heading.textContent = "Ready in your dashboard";
      const copy = doc.createElement("p"); copy.textContent = "Open Job Buddy to review the application before adding it to your tracker.";
      body.append(heading, copy);
      return;
    }
    if (this.model.state === "salary-evidence") {
      const evidence = { ...this.model.evidence };
      const heading = doc.createElement("h2"); heading.textContent = "Salary found";
      const copy = doc.createElement("p"); copy.textContent = "Review and correct this range before adding it to your local dashboard.";
      const form = doc.createElement("form"); form.className = "review-form";
      const minimumLabel = doc.createElement("label"); minimumLabel.textContent = `Minimum (${evidence.currency})`;
      const minimum = doc.createElement("input"); minimum.type = "number"; minimum.name = "salary-minimum"; minimum.min = "1"; minimum.value = String(evidence.minimum);
      minimum.addEventListener("input", () => { evidence.minimum = Number(minimum.value); }); minimumLabel.append(minimum);
      const maximumLabel = doc.createElement("label"); maximumLabel.textContent = `Maximum (${evidence.currency})`;
      const maximum = doc.createElement("input"); maximum.type = "number"; maximum.name = "salary-maximum"; maximum.min = "1"; maximum.value = String(evidence.maximum);
      maximum.addEventListener("input", () => { evidence.maximum = Number(maximum.value); }); maximumLabel.append(maximum);
      const periodLabel = doc.createElement("label"); periodLabel.textContent = "Pay period";
      const period = doc.createElement("select"); period.name = "salary-period";
      for (const value of ["monthly", "annual"] as const) { const option = doc.createElement("option"); option.value = value; option.textContent = value; option.selected = value === evidence.period; period.append(option); }
      period.addEventListener("change", () => { evidence.period = period.value as PendingSalaryEvidence["period"]; }); periodLabel.append(period);
      const send = doc.createElement("button"); send.type = "submit"; send.className = "primary"; send.dataset.action = "add-salary-evidence"; send.textContent = "Add salary evidence";
      form.append(minimumLabel, maximumLabel, periodLabel, send);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (Number.isFinite(evidence.minimum) && Number.isFinite(evidence.maximum) && evidence.minimum > 0 && evidence.maximum >= evidence.minimum) void this.onSendSalaryEvidence(evidence);
      });
      const guarantee = doc.createElement("small"); guarantee.textContent = "Nothing is sent until you click Add salary evidence. Form answers and page content stay on this page.";
      body.append(heading, copy, form, guarantee);
      return;
    }
    if (this.model.state === "salary-evidence-sent") {
      const heading = doc.createElement("h2"); heading.textContent = "Salary evidence queued";
      const copy = doc.createElement("p"); copy.textContent = "Open the matching application in Job Buddy to import it.";
      body.append(heading, copy);
      return;
    }
    const heading = doc.createElement("h2");
    heading.textContent = this.model.state === "error" ? "Buddy needs attention" : "Ready for this application";
    const copy = doc.createElement("p");
    copy.textContent = this.model.state === "error" ? this.model.message : "Scan and guarded autofill controls will appear here.";
    body.append(heading, copy);
  }

  private count(label: string, value: number): HTMLElement {
    const doc = this.host.ownerDocument;
    const card = doc.createElement("div"); card.className = "count";
    const strong = doc.createElement("strong"); strong.textContent = String(value);
    const span = doc.createElement("span"); span.textContent = label;
    card.append(strong, span);
    return card;
  }
}
