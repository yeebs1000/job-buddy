import { applicationRepository } from "../../db/applicationRepository";
import type { ImportPreview } from "../../domain/import";

export async function confirmImport(preview: ImportPreview): Promise<ImportPreview> {
  const rows = preview.rows.map(row => ({ ...row }));
  for (const row of rows) {
    if (!row.included || row.errors.length || row.result === "imported") continue;
    const id = row.applicationId ?? crypto.randomUUID(); row.applicationId = id;
    const { stage, outcome, ...application } = row.normalized;
    try {
      // create() atomically stores this application and its accepted initial event.
      await applicationRepository.create({ ...application, id, stageEvents: [{ id: `import-event-${id}`, applicationId: id, at: application.appliedAt, ...(stage ? { toStage: stage } : {}), ...(outcome ? { outcome } : {}), accepted: true, origin: "import" }] });
      row.result = "imported"; row.included = false; row.importError = undefined;
    } catch (error) { row.result = "failed"; row.importError = error instanceof Error ? error.message : "Could not save this row. Try again."; }
  }
  return { ...preview, rows };
}
