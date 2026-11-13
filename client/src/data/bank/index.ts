// Original practice bank written for this artifact. Split into per-pack modules in P0-3 (November 13, 2026); question text is unchanged from the single file bank.

import { BUSINESS_QUESTIONS, PROCESS_QUESTIONS, SCENARIO_QUESTIONS } from "./legacy-core";
import { WEEK_ONE_QUESTIONS } from "./legacy-week-one";
import { FORMULA_QUESTIONS } from "./legacy-formula";
import { WEEK_TWO_QUESTIONS } from "./legacy-week-two";
import { WEEK_THREE_QUESTIONS } from "./legacy-week-three";
import { WEEK_FOUR_QUESTIONS } from "./legacy-week-four";
import { WEEK_FIVE_QUESTIONS } from "./legacy-week-five";
import { WEEK_SIX_QUESTIONS } from "./legacy-week-six";
import { CHART_QUESTIONS } from "./legacy-chart";
import { DOMAINS } from "./types";
import type { BankQuestion, DomainKey } from "./types";

export * from "./types";
export { BUSINESS_QUESTIONS, PROCESS_QUESTIONS, SCENARIO_QUESTIONS } from "./legacy-core";
export { WEEK_ONE_QUESTIONS } from "./legacy-week-one";
export { FORMULA_QUESTIONS } from "./legacy-formula";
export { WEEK_TWO_QUESTIONS } from "./legacy-week-two";
export { WEEK_THREE_QUESTIONS } from "./legacy-week-three";
export { WEEK_FOUR_QUESTIONS } from "./legacy-week-four";
export { WEEK_FIVE_QUESTIONS } from "./legacy-week-five";
export { WEEK_SIX_QUESTIONS } from "./legacy-week-six";
export { CHART_QUESTIONS } from "./legacy-chart";

export const ALL_SCENARIO_QUESTIONS: BankQuestion[] = [
  ...SCENARIO_QUESTIONS,
  ...PROCESS_QUESTIONS,
  ...BUSINESS_QUESTIONS,
  ...WEEK_ONE_QUESTIONS,
  ...WEEK_TWO_QUESTIONS,
  ...WEEK_THREE_QUESTIONS,
  ...WEEK_FOUR_QUESTIONS,
  ...WEEK_FIVE_QUESTIONS,
  ...WEEK_SIX_QUESTIONS,
];

export const ALL_QUESTIONS: BankQuestion[] = [
  ...ALL_SCENARIO_QUESTIONS,
  ...CHART_QUESTIONS,
  ...FORMULA_QUESTIONS,
];

export function findQuestion(id: string): BankQuestion | undefined {
  return ALL_QUESTIONS.find((q) => q.id === id);
}

export function spokenQuestionText(q: BankQuestion): string {
  const letters = ["A", "B", "C", "D"];
  const opts = q.options
    .map((o, i) => `Option ${letters[i] ?? ""}: ${o}`)
    .join(". ");
  return `${q.scenario} ${q.stem} ${opts}.`;
}

export function spokenExplanationText(q: BankQuestion): string {
  return `${q.explanation} Exam trap: ${q.trap}`;
}

export function allocationForSize(size: number): Record<DomainKey, number> {
  const result: Record<DomainKey, number> = {
    people: 0,
    "process": 0,
    business: 0,
  };
  const remainders: { key: DomainKey; rem: number }[] = [];
  let assigned = 0;
  for (const d of DOMAINS) {
    const exact = (size * d.weight) / 100;
    const base = Math.floor(exact);
    result[d.key] = base;
    assigned += base;
    remainders.push({ key: d.key, rem: exact - base });
  }
  remainders.sort((a, b) => b.rem - a.rem);
  let idx = 0;
  while (assigned < size && remainders.length > 0) {
    const entry = remainders[idx % remainders.length];
    if (entry) {
      result[entry.key] += 1;
      assigned += 1;
    }
    idx += 1;
  }
  return result;
}
