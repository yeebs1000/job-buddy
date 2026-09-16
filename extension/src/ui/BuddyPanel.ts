import { buddyStyles } from "./styles";

export type BuddyPanelModel =
  | { state: "unpaired" }
  | { state: "idle" }
  | { state: "fields-found"; matched: number; review: number; manual: number }
  | { state: "error"; message: string };

export interface BuddyPanelOptions { onPair?: (code: string) => Promise<void> | void; }

export class BuddyPanel {
  readonly host: HTMLDivElement;
  readonly shadowRoot: ShadowRoot;
  expanded = false;
  private model: BuddyPanelModel = { state: "idle" };
  private readonly onPair: (code: string) => Promise<void> | void;

  constructor(parent: HTMLElement, options: BuddyPanelOptions = {}) {
    this.host = parent.ownerDocument.createElement("div");
    this.host.dataset.jobBuddy = "panel";
    this.host.dataset.corner = "right";
    this.shadowRoot = this.host.attachShadow({ mode: "open" });
    this.onPair = options.onPair ?? (() => undefined);
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
    panel.append(header, body);
    return panel;
  }

  private populateBody(body: HTMLElement): void {
    const doc = this.host.ownerDocument;
    if (this.model.state === "unpaired") {
      const heading = doc.createElement("h2"); heading.textContent = "Pair this browser";
      const copy = doc.createElement("p"); copy.textContent = "Create a one-time code in Job Buddy Settings, then enter it here.";
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
