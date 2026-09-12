import type { ApplicationStage, StageEvent } from "./stage";

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
  location: {
    city: string;
    country: "Singapore" | "Hong Kong";
  };
  source: string;
  appliedAt: string;
  tags: string[];
  interviewSubtype?: "phone" | "video" | "technical" | "case" | "onsite" | "final";
  deadlines: Deadline[];
  research: ResearchSnapshot;
  stageEvents: StageEvent[];
  targetStage?: ApplicationStage;
}
