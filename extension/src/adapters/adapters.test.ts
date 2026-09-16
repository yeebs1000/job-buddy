import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { selectAdapter } from "./types";

describe("form adapters", () => {
  it.each(["generic", "greenhouse"])("extracts labels and fills through native events for %s", (fixture) => {
    loadFixture(fixture);
    const adapter = selectAdapter(document, new URL(fixture === "greenhouse" ? "https://boards.greenhouse.io/example/jobs/1" : "https://jobs.example/apply"));
    const fields = adapter.scan();
    const email = fields.find((field) => field.canonicalPath === "contact.email")!;
    const events: string[] = [];
    email.element.addEventListener("input", () => events.push("input"));
    email.element.addEventListener("change", () => events.push("change"));

    expect(adapter.fill(email, "alex@example.com")).toEqual({ ok: true });
    expect((email.element as HTMLInputElement).value).toBe("alex@example.com");
    expect(events).toEqual(["input", "change"]);
  });

  it("selects Greenhouse only with stable markers", () => {
    loadFixture("generic");
    document.body.className = "greenhouse-looking";
    expect(selectAdapter(document, new URL("https://jobs.example/apply")).id).toBe("generic");
    loadFixture("greenhouse");
    expect(selectAdapter(document, new URL("https://boards.greenhouse.io/example/jobs/1")).id).toBe("greenhouse");
  });

  it("keeps files, EEO, passwords, and final submit manual", () => {
    loadFixture("generic");
    const fields = selectAdapter(document, new URL("https://jobs.example/apply")).scan();
    expect(fields.find((field) => field.label === "Resume")?.risk).toBe("manual");
    expect(fields.find((field) => field.label === "Gender")?.risk).toBe("manual");
    expect(fields.find((field) => field.label === "Password")?.risk).toBe("manual");
    expect(fields.find((field) => field.label === "Submit application")?.risk).toBe("manual");
  });
});

function loadFixture(name: string) {
  document.documentElement.innerHTML = readFileSync(resolve(process.cwd(), "extension", "fixtures", `${name}.html`), "utf8");
}
