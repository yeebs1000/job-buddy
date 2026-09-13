import type { ApplicationStage, StageEvent } from "./stage";

export const roleFamilies = ["finance", "software", "data", "cybersecurity", "cloud", "IT"] as const;
export const workArrangements = ["onsite", "hybrid", "remote"] as const;
export const priorities = ["low", "normal", "high"] as const;

export interface Deadline {
  id: string;
  label: string;
  at: string;
  completed: boolean;
}

export interface ResearchSnapshot {
  salary: {
    minimum: number;
    maximum?: number;
    currency: "SGD" | "HKD";
    period: "monthly" | "annual";
  };
  companyRating: {
    score: number;
    outOf: number;
    source: string;
  };
}

export interface Application {
  id: string;
  company: string;
  role: string;
  discipline: "finance" | "software_it";
  // Optional for records created before the standard-column contract.
  industry?: string;
  roleFamily?: (typeof roleFamilies)[number];
  market?: "SG" | "HK";
  workArrangement?: (typeof workArrangements)[number];
  priority?: (typeof priorities)[number];
  recruiter?: string;
  notes?: string;
  archived?: boolean;
  unreadUpdate?: boolean;
  missingData?: boolean;
  followUpAt?: string;
  location: {
    city: string;
    country: "Singapore" | "Hong Kong";
  };
  source: string;
  appliedAt: string;
  tags: string[];
  interviewSubtype?: "phone" | "video" | "technical" | "case" | "onsite" | "final";
  deadlines: Deadline[];
  research?: ResearchSnapshot;
  stageEvents: StageEvent[];
  targetStage?: ApplicationStage;
}
