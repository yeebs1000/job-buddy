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

  it.each([
    ["workday", "workday", "contact.phoneNational", "https://acme.wd5.myworkdayjobs.com/en-US/jobs/job/1"],
    ["oracle", "oracle", "preferences.sgAuthorization", "https://acme.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/jobs/job/1"],
    ["lever", "lever", "links.linkedin", "https://jobs.lever.co/acme/role-id"],
  ])("selects the %s adapter without weakening field risk", (fixture, expected, expectedPath, url) => {
    loadFixture(fixture);
    const adapter = selectAdapter(document, new URL(url));
    const fields = adapter.scan();
    expect(adapter.id).toBe(expected);
    expect(fields).toEqual(expect.arrayContaining([expect.objectContaining({ canonicalPath: expectedPath })]));
    expect(fields.find((field) => field.canonicalPath?.includes("Authorization"))?.risk).not.toBe("safe");
  });

  it("falls back to Generic for vendor-like classes without stable markers", () => {
    document.body.innerHTML = `<form class="workday oracle lever greenhouse"><label>Email<input name="email"></label></form>`;
    expect(selectAdapter(document, new URL("https://jobs.example/apply")).id).toBe("generic");
  });

  it("ignores disabled fields and gives duplicate DOM ids unique scan ids", () => {
    document.body.innerHTML = `<form>
      <label for="shared">First name</label><input id="shared" name="first_name">
      <label for="shared-two">Email</label><input id="shared" name="email" type="email">
      <label>Phone<input name="phone" disabled></label>
      <iframe src="https://different.example/form"></iframe>
    </form>`;
    const fields = selectAdapter(document, new URL("https://jobs.example/apply")).scan();
    expect(new Set(fields.map((field) => field.id)).size).toBe(fields.length);
    expect(fields).toHaveLength(2);
  });
});

function loadFixture(name: string) {
  document.documentElement.innerHTML = readFileSync(resolve(process.cwd(), "extension", "fixtures", `${name}.html`), "utf8");
}
