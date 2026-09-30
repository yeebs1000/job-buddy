import { jobBuddyDb } from "../../db/database";
import { webSalarySnapshotSchema, type WebSalarySnapshot } from "../../domain/webSalary";
export const webSalaryRepository = {
  async get(applicationId: string) {
    const record = await jobBuddyDb.metadata.get(`web-salary:${applicationId}`);
    if (!record) return undefined;
    try { return webSalarySnapshotSchema.parse(JSON.parse(record.value)); } catch { return undefined; }
  },
  async save(snapshot: WebSalarySnapshot) {
    const valid = webSalarySnapshotSchema.parse(snapshot);
    await jobBuddyDb.metadata.put({ key: `web-salary:${valid.id}`, value: JSON.stringify(valid) });
  },
};
