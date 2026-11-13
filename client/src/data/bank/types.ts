// Original practice bank written for this artifact. Split into per-pack modules in P0-3 (November 13, 2026); question text is unchanged from the single file bank.

export type DomainKey = "people" | "process" | "business";

export interface DomainInfo {
  key: DomainKey;
  name: string;
  weight: number;
}

export const DOMAINS: DomainInfo[] = [
  { key: "people", name: "People", weight: 33 },
  { key: "process", name: "Process", weight: 41 },
  { key: "business", name: "Business Environment", weight: 26 },
];

export const PROCESS_GROUPS = [
  "Initiating",
  "Planning",
  "Executing",
  "Monitoring and Controlling",
  "Closing",
] as const;

export type ProcessGroup = (typeof PROCESS_GROUPS)[number];

export type QuestionFormat = "next" | "avoid" | "best" | "first" | "formula";

export interface BankQuestion {
  id: string;
  kind: "scenario" | "chart" | "formula";
  domain: DomainKey;
  format: QuestionFormat;
  topic: string;
  processGroup: ProcessGroup | null;
  scenario: string;
  stem: string;
  options: string[];
  correct: number;
  explanation: string;
  trap: string;
}
