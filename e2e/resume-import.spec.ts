import { expect, test, type Page } from "@playwright/test";
import { zipSync, strToU8 } from "fflate";
import { emptyCandidateProfile, type CandidateProfile } from "../src/domain/profile";

const resumeLines = ["Alex Chen", "alex@example.com", "+65 8123 4567", "", "EDUCATION", "Example University", "BSc Computing", "Sep 2020 - Jun 2024", "", "EXPERIENCE", "Engineer | Example Labs", "Jul 2024 - Present", "Built payment APIs.", "", "SKILLS", "TypeScript, SQL"];

function pdf(lines: string[], columns = false) {
  const escape = (value: string) => value.replace(/[\\()]/g, "\\$&");
  const stream = columns ? `BT /F1 10 Tf\n${lines.map((line, index) => line.split("\t").map((part, column) => `1 0 0 1 ${column ? 420 : 50} ${750 - index * 14} Tm (${escape(part)}) Tj`).join("\n")).join("\n")}\nET`
    : `BT /F1 12 Tf 50 750 Td 18 TL\n${lines.map((line, index) => `${index ? "T* " : ""}(${escape(line)}) Tj`).join("\n")}\nET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let value = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(value)); value += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(value);
  value += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(value);
}

async function profileApi(page: Page, initial?: CandidateProfile) {
  let profile: CandidateProfile = initial ?? { ...structuredClone(emptyCandidateProfile), contact: { email: "keep@example.com" } };
  let saves = 0;
  const unexpectedRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && url.hostname !== "127.0.0.1") unexpectedRequests.push(request.url());
    if (request.method() !== "GET" && url.pathname !== "/api/profile") unexpectedRequests.push(request.url());
  });
  await page.route("**/api/profile", async (route) => {
    if (route.request().method() === "PUT") { profile = route.request().postDataJSON(); saves++; }
    await route.fulfill({ json: route.request().method() === "GET" ? { platformSupported: true, hasProfile: true, profile } : { profile } });
  });
  return { profile: () => profile, saves: () => saves, unexpectedRequests };
}

test("repairs an earlier import from a Word-style PDF without saving until confirmed", async ({ page }, testInfo) => {
  const api = await profileApi(page, { ...structuredClone(emptyCandidateProfile), education: [{ degree: "Old incomplete degree" }], experience: Array.from({ length: 10 }, () => ({ title: "Old detached bullet" })), projects: [{ title: "Old detached text" }] });
  const lines = ["Alex Chen", "EDUCATION", "Example University\tAug 2026 - Expected Jul 2027", "Master of Finance, Corporate Finance", "", "Sample University\tAug 2019 - May 2023", "Bachelor of Engineering (Honours), Materials Engineering", "PROFESSIONAL EXPERIENCE", "Example Labs\tSept 2025 - Present", "Operations Manager\tSingapore", "- Lead planning across teams", "and coordinate regional delivery.", "", "Sample Consulting\tApr 2025 - Aug 2025", "Consulting Intern\tHong Kong", "- Reviewed controls.", "PERSONAL PROJECTS", "- Trading simulator - evaluates signals", "with bounded risk.", "- Research assistant - organises public data.", "- Local inference node - runs locally.", "SKILLS, LANGUAGES & INTERESTS", "Technical: Python, SQL", "Languages: English and Mandarin", "Interests: Chess"];
  await page.goto("/profile");
  await page.getByRole("button", { name: "Import resume", exact: true }).click();
  await page.getByLabel("Choose resume file").setInputFiles({ name: "word-layout.pdf", mimeType: "application/pdf", buffer: pdf(lines, true) });
  await expect(page.getByRole("checkbox", { name: "Include Education", exact: true })).toHaveCount(2);
  await expect(page.getByRole("checkbox", { name: "Include Experience", exact: true })).toHaveCount(2);
  await expect(page.getByRole("checkbox", { name: "Include Project", exact: true })).toHaveCount(3);
  for (const section of ["education", "experience", "projects"]) {
    const replace = page.getByRole("checkbox", { name: new RegExp(`Replace existing ${section}`) });
    await expect(replace).not.toBeChecked(); await replace.check();
  }
  await page.locator(".resume-import__replacement").screenshot({ path: testInfo.outputPath("replacement-options.png") });
  await page.getByRole("button", { name: "Apply selected details", exact: true }).click();
  await expect(page.getByLabel("Institution 1", { exact: true })).toHaveValue("Example University");
  await expect(page.getByLabel("Education end month 1", { exact: true })).toHaveValue("2027-07");
  await expect(page.getByLabel("Employer 1", { exact: true })).toHaveValue("Example Labs");
  await expect(page.getByLabel("Experience start month 1", { exact: true })).toHaveValue("2025-09");
  await expect(page.getByLabel("Work location 1", { exact: true })).toHaveValue("Singapore");
  await expect(page.getByRole("textbox", { name: "Experience summary 1", exact: true })).toHaveValue("- Lead planning across teams and coordinate regional delivery.");
  await expect(page.getByLabel("Skills", { exact: true })).toHaveValue("Python, SQL");
  expect(api.saves()).toBe(0);
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByText("Profile saved locally.")).toBeVisible();
  expect(api.profile().experience).toHaveLength(2);
  expect(api.profile().education).toHaveLength(2);
  expect(api.profile().projects).toHaveLength(3);
  expect(api.unexpectedRequests).toEqual([]);
});

for (const format of ["pdf", "docx"] as const) {
  test(`imports a real ${format.toUpperCase()} locally, reviews conflicts, and saves only selected data`, async ({ page }, testInfo) => {
    const api = await profileApi(page);
    await page.goto("/profile");
    await page.getByRole("button", { name: "Import resume", exact: true }).click();
    const buffer = format === "pdf" ? pdf(resumeLines) : Buffer.from(zipSync({ "word/document.xml": strToU8(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${resumeLines.map((line) => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`) }));
    await page.getByLabel("Choose resume file").setInputFiles({ name: `resume.${format}`, mimeType: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer });
    await expect(page.getByRole("checkbox", { name: "Include Email", exact: true })).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Include Experience", exact: true })).toBeChecked();
    await expect(page.getByRole("button", { name: "Save profile", exact: true })).toBeDisabled();
    expect(api.saves()).toBe(0);
    expect(api.unexpectedRequests).toEqual([]);
    await page.getByLabel(/Suggested First name/).fill("Alexandra");
    await page.getByLabel(/Suggested Start month/).first().fill("2020-01");
    if (format === "docx") {
      await page.locator(".resume-import").screenshot({ path: testInfo.outputPath("review-desktop.png") });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
      await page.locator(".resume-import").screenshot({ path: testInfo.outputPath("review-mobile.png") });
    }
    await page.getByRole("button", { name: "Apply selected details", exact: true }).click();
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue("keep@example.com");
    await expect(page.getByLabel("First name", { exact: true })).toHaveValue("Alexandra");
    await expect(page.getByLabel("Employer 1", { exact: true })).toHaveValue("Example Labs");
    await expect(page.getByLabel("Education start month 1", { exact: true })).toHaveValue("2020-01");
    expect(api.saves()).toBe(0);
    await page.getByRole("button", { name: "Save profile", exact: true }).click();
    await expect(page.getByText("Profile saved locally.")).toBeVisible();
    expect(api.saves()).toBe(1);
    expect(api.profile().skills).toEqual(["TypeScript", "SQL"]);
    expect(JSON.stringify(api.profile())).not.toMatch(/resume-|source|suggestions|warnings|data:|base64/);
    await page.reload();
    await expect(page.getByLabel("First name", { exact: true })).toHaveValue("Alexandra");
    expect(api.unexpectedRequests).toEqual([]);
  });
}

test("handles unreadable files, allows paste fallback, and cancels without retaining text", async ({ page }) => {
  const api = await profileApi(page);
  await page.goto("/profile");
  await page.getByRole("button", { name: "Import resume", exact: true }).click();
  await page.getByLabel("Choose resume file").setInputFiles({ name: "empty.pdf", mimeType: "application/pdf", buffer: pdf([]) });
  await expect(page.getByRole("alert")).toContainText("No readable text");
  await page.getByLabel("Paste resume text").fill("Alex Chen\nalex@example.com");
  await page.getByRole("button", { name: "Review extracted details", exact: true }).click();
  await page.getByRole("checkbox", { name: "Include Email", exact: true }).check();
  await page.getByRole("button", { name: "Cancel import", exact: true }).click();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("keep@example.com");
  await page.getByRole("button", { name: "Import resume", exact: true }).click();
  await expect(page.getByLabel("Paste resume text")).toHaveValue("");
  expect(api.saves()).toBe(0);
});
