import type { Application } from "../domain/application";

export const sampleApplications: Application[] = [
  {
    id: "app-aurora-applied", company: "Aurora Ledger Pte Ltd", role: "Investment Analyst", discipline: "finance",
    market: "SG", roleFamily: "finance", industry: "Financial services", workArrangement: "hybrid", priority: "normal",
    location: { city: "Singapore", country: "Singapore" }, source: "LinkedIn", appliedAt: "2026-09-01T02:15:00Z", tags: ["asset-management", "graduate"],
    deadlines: [{ id: "d1", label: "Follow up", at: "2026-09-15T09:00:00Z", completed: false }],
    research: { salary: { minimum: 4800, maximum: 6200, currency: "SGD", period: "monthly" }, companyRating: { score: 4.1, outOf: 5, source: "Fictional Reviews" } },
    stageEvents: [{ id: "e1", applicationId: "app-aurora-applied", at: "2026-09-01T02:15:00Z", toStage: "applied", origin: "manual", accepted: true }],
  },
  {
    id: "app-circuit-review", company: "Circuit Harbour Ltd", role: "Software Engineer", discipline: "software_it",
    market: "SG", roleFamily: "software", industry: "Technology", workArrangement: "hybrid", priority: "high",
    location: { city: "Singapore", country: "Singapore" }, source: "Company careers", appliedAt: "2026-08-28T04:00:00Z", tags: ["typescript", "platform"], interviewSubtype: "technical",
    deadlines: [{ id: "d2", label: "Recruiter follow-up", at: "2026-09-16T04:00:00Z", completed: false }],
    research: { salary: { minimum: 7000, maximum: 9000, currency: "SGD", period: "monthly" }, companyRating: { score: 3.9, outOf: 5, source: "Fictional Reviews" } },
    stageEvents: [
      { id: "e2a", applicationId: "app-circuit-review", at: "2026-08-28T04:00:00Z", toStage: "applied", origin: "manual", accepted: true },
      { id: "e2b", applicationId: "app-circuit-review", at: "2026-09-03T01:30:00Z", fromStage: "applied", toStage: "review", origin: "gmail", accepted: true, confidence: 0.96 },
    ],
  },
  {
    id: "app-pine-assessment", company: "Pine Street Capital", role: "Risk Analyst", discipline: "finance",
    market: "HK", roleFamily: "finance", industry: "Financial services", workArrangement: "onsite", priority: "high",
    location: { city: "Hong Kong", country: "Hong Kong" }, source: "Campus portal", appliedAt: "2026-08-24T03:00:00Z", tags: ["risk", "markets"], interviewSubtype: "case",
    deadlines: [{ id: "d3", label: "Numerical assessment", at: "2026-09-14T02:00:00Z", completed: false }],
    research: { salary: { minimum: 28000, maximum: 35000, currency: "HKD", period: "monthly" }, companyRating: { score: 4.0, outOf: 5, source: "Fictional Reviews" } },
    stageEvents: [
      { id: "e3a", applicationId: "app-pine-assessment", at: "2026-08-24T03:00:00Z", toStage: "applied", origin: "manual", accepted: true },
      { id: "e3b", applicationId: "app-pine-assessment", at: "2026-09-04T08:00:00Z", fromStage: "applied", toStage: "assessment", origin: "gmail", accepted: true, confidence: 0.94 },
    ],
  },
  {
    id: "app-moon-interview", company: "Moonbeam Systems", role: "Data Engineer", discipline: "software_it",
    market: "HK", roleFamily: "data", industry: "Technology", workArrangement: "hybrid", priority: "high",
    location: { city: "Hong Kong", country: "Hong Kong" }, source: "Referral", appliedAt: "2026-08-20T07:45:00Z", tags: ["data", "python"], interviewSubtype: "video",
    deadlines: [{ id: "d4", label: "Video interview", at: "2026-09-13T06:00:00Z", completed: false }],
    research: { salary: { minimum: 30000, maximum: 42000, currency: "HKD", period: "monthly" }, companyRating: { score: 4.3, outOf: 5, source: "Fictional Reviews" } },
    stageEvents: [
      { id: "e4a", applicationId: "app-moon-interview", at: "2026-08-20T07:45:00Z", toStage: "applied", origin: "manual", accepted: true },
      { id: "e4b", applicationId: "app-moon-interview", at: "2026-09-05T05:00:00Z", fromStage: "applied", toStage: "interview", origin: "gmail", accepted: true, confidence: 0.98 },
    ],
  },
  {
    id: "app-orchard-final", company: "Orchard Advisory", role: "Corporate Finance Associate", discipline: "finance",
    market: "SG", roleFamily: "finance", industry: "Financial services", workArrangement: "onsite", priority: "high",
    location: { city: "Singapore", country: "Singapore" }, source: "LinkedIn", appliedAt: "2026-08-15T01:00:00Z", tags: ["m-and-a", "advisory"], interviewSubtype: "final",
    deadlines: [{ id: "d5", label: "Final panel", at: "2026-09-17T03:00:00Z", completed: false }],
    research: { salary: { minimum: 6500, maximum: 8200, currency: "SGD", period: "monthly" }, companyRating: { score: 4.2, outOf: 5, source: "Fictional Reviews" } },
    stageEvents: [
      { id: "e5a", applicationId: "app-orchard-final", at: "2026-08-15T01:00:00Z", toStage: "applied", origin: "manual", accepted: true },
      { id: "e5b", applicationId: "app-orchard-final", at: "2026-09-01T03:00:00Z", fromStage: "applied", toStage: "interview", origin: "gmail", accepted: true, confidence: 0.95 },
      { id: "e5c", applicationId: "app-orchard-final", at: "2026-09-06T03:00:00Z", fromStage: "interview", toStage: "final", origin: "gmail", accepted: true, confidence: 0.95 },
    ],
  },
  {
    id: "app-cobalt-offer", company: "Cobalt Cloud Works", role: "Product Engineer", discipline: "software_it",
    market: "HK", roleFamily: "software", industry: "Technology", workArrangement: "remote", priority: "high",
    location: { city: "Hong Kong", country: "Hong Kong" }, source: "Company careers", appliedAt: "2026-08-10T05:30:00Z", tags: ["frontend", "product"], interviewSubtype: "onsite",
    deadlines: [{ id: "d6", label: "Offer response", at: "2026-09-18T09:00:00Z", completed: false }],
    research: { salary: { minimum: 36000, maximum: 45000, currency: "HKD", period: "monthly" }, companyRating: { score: 3.8, outOf: 5, source: "Fictional Reviews" } },
    stageEvents: [
      { id: "e6a", applicationId: "app-cobalt-offer", at: "2026-08-10T05:30:00Z", toStage: "applied", origin: "manual", accepted: true },
      { id: "e6b", applicationId: "app-cobalt-offer", at: "2026-09-03T09:00:00Z", fromStage: "applied", toStage: "final", origin: "gmail", accepted: true, confidence: 0.99 },
      { id: "e6c", applicationId: "app-cobalt-offer", at: "2026-09-07T09:00:00Z", fromStage: "final", toStage: "offer", origin: "gmail", accepted: true, confidence: 0.99 },
    ],
  },
  {
    id: "app-river-rejected", company: "Riverbank Partners", role: "Portfolio Operations Analyst", discipline: "finance",
    market: "SG", roleFamily: "finance", industry: "Financial services", workArrangement: "onsite", priority: "normal",
    location: { city: "Singapore", country: "Singapore" }, source: "Campus portal", appliedAt: "2026-08-12T04:30:00Z", tags: ["operations", "funds"],
    deadlines: [{ id: "d7", label: "Archive notes", at: "2026-09-12T04:30:00Z", completed: false }],
    research: { salary: { minimum: 4500, maximum: 5800, currency: "SGD", period: "monthly" }, companyRating: { score: 3.6, outOf: 5, source: "Fictional Reviews" } },
    stageEvents: [
      { id: "e7a", applicationId: "app-river-rejected", at: "2026-08-12T04:30:00Z", toStage: "applied", origin: "manual", accepted: true },
      { id: "e7b", applicationId: "app-river-rejected", at: "2026-08-28T04:30:00Z", fromStage: "applied", toStage: "review", origin: "gmail", accepted: true, confidence: 0.97 },
      { id: "e7c", applicationId: "app-river-rejected", at: "2026-09-02T04:30:00Z", fromStage: "review", outcome: "rejected", origin: "gmail", accepted: true, confidence: 0.97 },
    ],
  },
  {
    id: "app-lantern-withdrawn", company: "Lantern Loop Studio", role: "IT Support Analyst", discipline: "software_it",
    market: "HK", roleFamily: "IT", industry: "Technology", workArrangement: "onsite", priority: "low",
    location: { city: "Hong Kong", country: "Hong Kong" }, source: "Jobs board", appliedAt: "2026-08-18T02:00:00Z", tags: ["support", "saas"], interviewSubtype: "phone",
    deadlines: [{ id: "d8", label: "Withdrawal confirmation", at: "2026-09-11T02:00:00Z", completed: true }],
    research: { salary: { minimum: 22000, maximum: 28000, currency: "HKD", period: "monthly" }, companyRating: { score: 3.7, outOf: 5, source: "Fictional Reviews" } },
    stageEvents: [
      { id: "e8a", applicationId: "app-lantern-withdrawn", at: "2026-08-18T02:00:00Z", toStage: "applied", origin: "manual", accepted: true },
      { id: "e8b", applicationId: "app-lantern-withdrawn", at: "2026-08-25T02:00:00Z", fromStage: "applied", toStage: "review", origin: "gmail", accepted: true, confidence: 0.93 },
      { id: "e8c", applicationId: "app-lantern-withdrawn", at: "2026-09-01T02:00:00Z", fromStage: "review", outcome: "withdrawn", origin: "manual", accepted: true },
    ],
  },
];
