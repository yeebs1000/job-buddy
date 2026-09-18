import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { selectAdapter } from "./types";

describe("form adapters", () => {
  it("recognizes the current Oracle apply flow without the obsolete candidate-experience marker", () => {
    loadFixture("oracle-address");
    expect(selectAdapter(document, new URL("https://acme.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/1/apply/section/1/")).id).toBe("oracle");
    expect(selectAdapter(document, new URL("https://jobs.example/apply")).id).toBe("generic");
  });

  it("uses split address meaning instead of Oracle's generic autocomplete hints", () => {
    loadFixture("oracle-address");
    const adapter = selectAdapter(document, new URL("https://acme.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/1/apply/section/1/"));
    const fields = adapter.scan();
    for (const [id, path, value] of [
      ["addressLine1-22", "contact.houseNumber", "12A"],
      ["addressLine2-23", "contact.streetName", "Example Road"],
      ["addressLine3-24", "contact.unitNumber", "#03-45"],
      ["building-25", "contact.buildingName", "Example House"],
    ]) {
      const field = fields.find((entry) => entry.id === id)!;
      expect(field.canonicalPath).toBe(path);
      expect(adapter.fill(field, value)).toEqual({ ok: true });
      expect(field.element.value).toBe(value);
    }
  });

  it("leaves custom selectors untouched without hiding the actual phone field as a duplicate", () => {
    loadFixture("oracle-address");
    const adapter = selectAdapter(document, new URL("https://acme.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/1/apply/section/1/"));
    const fields = adapter.scan();
    const phone = fields.find((field) => field.element.getAttribute("type") === "tel")!;
    expect(phone.canonicalPath).toBe("contact.phoneNational");
    const selector = fields.find((field) => field.id === "country-codes-dropdownphoneNumber")!;
    expect(selector.label).toBe("Country code");
    for (const field of fields.filter((entry) => entry.element.getAttribute("role") === "combobox")) {
      const before = field.element.value;
      expect(field).toMatchObject({ risk: "manual", canonicalPath: undefined, reason: "custom-selection-required" });
      expect(adapter.fill(field, "Hong Kong").ok).toBe(false);
      expect(field.element.value).toBe(before);
    }
  });
  it("leaves historical and repeated location fields manual instead of using candidate address", () => {
    document.body.innerHTML = `<form>
      <fieldset><legend>Employment 1</legend><label>City<input id="work-city"></label></fieldset>
      <section aria-label="Education"><label>Country<input id="school-country"></label></section>
      <label>City<input id="city-one"></label><label>City<input id="city-two"></label>
    </form>`;
    const fields = selectAdapter(document, new URL("https://jobs.example/apply")).scan();
    expect(fields.every((field) => field.canonicalPath === undefined && field.risk === "manual")).toBe(true);
  });
  it("matches common address labels and select labels without reading option text as the question", () => {
    document.body.innerHTML = `<form>
      <label>City *<input id="city"></label>
      <label>Country<select id="country"><option value="">Select country</option><option>Singapore</option></select></label>
      <label>Postal code<input id="postal"></label>
      <label>Legal first name<input id="first" name="legalFirstName"></label>
    </form>`;
    const adapter = selectAdapter(document, new URL("https://jobs.example/apply"));
    expect(adapter.scan().map((field) => field.canonicalPath)).toEqual(["contact.city", "contact.country", "contact.postalCode", "identity.givenName"]);
    const country = adapter.scan().find((field) => field.id === "country")!;
    expect(adapter.fill(country, "Singapore").ok).toBe(true);
    expect(document.querySelector<HTMLSelectElement>("#country")!.value).toBe("Singapore");
  });

  it("does not scan readonly, hidden, or disabled fieldsets", () => {
    document.body.innerHTML = `<input name="email" readonly><div hidden><input name="email"></div><div style="display:none"><input name="email"></div><fieldset disabled><input name="email"></fieldset><label>Email<input id="visible" name="email"></label>`;
    expect(selectAdapter(document, new URL("https://jobs.example/apply")).scan().map((field) => field.id)).toEqual(["visible"]);
  });

  it("reports when the page rejects a native value", () => {
    document.body.innerHTML = '<label>Email<input name="email"></label>';
    const adapter = selectAdapter(document, new URL("https://jobs.example/apply"));
    const field = adapter.scan()[0];
    field.element.addEventListener("change", () => { (field.element as HTMLInputElement).value = ""; });
    expect(adapter.fill(field, "alex@example.com").ok).toBe(false);
  });
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

  it("reports only strong application confirmation states", () => {
    loadFixture("generic");
    const adapter = selectAdapter(document, new URL("https://jobs.example/apply"));
    expect(adapter.confirmed()).toBe(false);
    document.body.innerHTML = `<main><h2 data-qa="application-success">Application submitted</h2></main>`;
    expect(adapter.confirmed()).toBe(true);
  });
});

function loadFixture(name: string) {
  document.documentElement.innerHTML = readFileSync(resolve(process.cwd(), "extension", "fixtures", `${name}.html`), "utf8");
}
