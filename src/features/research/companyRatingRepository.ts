import { jobBuddyDb } from "../../db/database";
import { companyRatingEvidenceSchema, type CompanyRatingEvidence } from "../../domain/companyRating";
export const companyRatingRepository = {
  async get(id: string) {
    const record = await jobBuddyDb.metadata.get(`company-rating:${id}`);
    if (!record) return undefined;
    return companyRatingEvidenceSchema.parse(JSON.parse(record.value));
  },
  async save(input: CompanyRatingEvidence) {
    const evidence = companyRatingEvidenceSchema.parse(input);
    await jobBuddyDb.metadata.put({ key: `company-rating:${evidence.id}`, value: JSON.stringify(evidence) });
  },
};
