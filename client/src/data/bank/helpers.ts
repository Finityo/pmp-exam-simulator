// Original practice bank written for this artifact. Split into per-pack modules in P0-3 (November 13, 2026); question text is unchanged from the single file bank.

import type { BankQuestion, DomainKey, ProcessGroup, QuestionFormat } from "./types";

export const S = (
  id: string,
  domain: DomainKey,
  format: QuestionFormat,
  topic: string,
  processGroup: ProcessGroup | null,
  scenario: string,
  stem: string,
  options: string[],
  correct: number,
  explanation: string,
  trap: string,
): BankQuestion => ({
  id,
  kind: "scenario",
  domain,
  format,
  topic,
  processGroup,
  scenario,
  stem,
  options,
  correct,
  explanation,
  trap,
});

export const F = (
  id: string,
  topic: string,
  processGroup: ProcessGroup | null,
  scenario: string,
  stem: string,
  options: string[],
  correct: number,
  explanation: string,
  trap: string,
): BankQuestion => ({
  id,
  kind: "formula",
  domain: "process",
  format: "formula",
  topic,
  processGroup,
  scenario,
  stem,
  options,
  correct,
  explanation,
  trap,
});

export const C = (
  id: string,
  processGroup: ProcessGroup,
  topic: string,
  scenario: string,
  stem: string,
  options: string[],
  correct: number,
  explanation: string,
  trap: string,
): BankQuestion => ({
  id,
  kind: "chart",
  domain: "process",
  format: "best",
  topic,
  processGroup,
  scenario,
  stem,
  options,
  correct,
  explanation,
  trap,
});

