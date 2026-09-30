import { expect, type Page } from "@playwright/test";
import { sampleApplications } from "../../src/fixtures/sampleApplications";
import { deriveApplicationState } from "../../src/domain/stage";

/** Explicit test-only fixture data, inserted after the real empty-workspace migration. */
export async function seedTracker(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Add application", exact: true })).toBeVisible();
  const applications = sampleApplications.map(({ stageEvents, ...app }) => ({ ...app, ...deriveApplicationState(stageEvents), updatedAt: app.appliedAt }));
  const events = sampleApplications.flatMap(app => app.stageEvents);
  await page.evaluate(({ applications, events }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("job-buddy");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(["applications", "stageEvents"], "readwrite");
      for (const app of applications) tx.objectStore("applications").put(app);
      for (const event of events) tx.objectStore("stageEvents").put(event);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), { applications, events });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Application command center" })).toBeVisible();
}
