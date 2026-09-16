import type { ApplicationStage, StageEvent } from "./stage";
import type { Currency, Market, PayPeriod } from "./research";

export const roleFamilies = ["finance", "software", "data", "cybersecurity", "cloud", "IT"] as const;
export const workArrangements = ["onsite", "hybrid", "remote"] as const;
export const priorities = ["low", "normal", "high"] as const;

export interface Deadline {
  id: string;
  label: string;
  at: string;
  completed: boolean;
  links?: string[];
}

export interface ResearchSnapshot {
  salary?: {
    minimum: number;
    maximum?: number;
    currency: Currency;
    period: PayPeriod;
  };
  companyRating?: {
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
  market?: Market;
  workArrangement?: (typeof workArrangements)[number];
  priority?: (typeof priorities)[number];
  recruiter?: string;
  jobUrl?: string;
  notes?: string;
  archived?: boolean;
  unreadUpdate?: boolean;
  missingData?: boolean;
  followUpAt?: string;
  location: {
    city: string;
    country: "Singapore" | "Hong Kong" | "United States";
    state?: string;
    metroCode?: string;
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
