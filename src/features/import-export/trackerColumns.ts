// Public export schema. IDs, event history, evidence and profile data are deliberately absent.
export const trackerColumns = {
  company: "Company", role: "Role", discipline: "Discipline", industry: "Industry", roleFamily: "Role Family", market: "Market", city: "Location", workArrangement: "Work Arrangement", stage: "Stage", outcome: "Outcome", appliedAt: "Date Applied", source: "Source", priority: "Priority", tags: "Tags", recruiter: "Contact", jobUrl: "Link", notes: "Notes", archived: "Archived", unreadUpdate: "Unread Update", missingData: "Missing Data", followUpAt: "Follow Up", interviewSubtype: "Interview Type", targetStage: "Target Stage", salary: "Salary Minimum", salaryMax: "Salary Maximum", currency: "Currency", period: "Pay Period", rating: "Company Rating", ratingOutOf: "Rating Out Of", ratingSource: "Rating Source", deadline: "Deadline", deadlineLabel: "Deadline Label", deadlines: "Deadlines JSON", escaped: "Text Escaping",
} as const;
export type TrackerField = keyof typeof trackerColumns;
export const headingKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const aliases: Record<string, TrackerField> = { employer: "company", companyname: "company", title: "role", jobtitle: "role", position: "role", status: "stage", applicationstatus: "stage", dateapplied: "appliedAt", applieddate: "appliedAt", applicationdate: "appliedAt", country: "market", region: "market", city: "city", salary: "salary", salarymin: "salary", salarymax: "salaryMax", salarycurrency: "currency", salaryperiod: "period", url: "jobUrl", joburl: "jobUrl", joblink: "jobUrl", recruiter: "recruiter", contactperson: "recruiter", followupdate: "followUpAt", workmode: "workArrangement" };
export function mapHeading(value: string): TrackerField | null {
  return (Object.entries(trackerColumns).find(([field, label]) => [headingKey(field), headingKey(label)].includes(headingKey(value)))?.[0] as TrackerField | undefined) ?? aliases[headingKey(value)] ?? null;
}
