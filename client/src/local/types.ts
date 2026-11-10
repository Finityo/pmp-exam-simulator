// API types for the standalone build.
//
// These interfaces mirror, field for field, the response schemas the
// original server actions declared. They live here so the client never
// imports any server runtime code: the ported action logic in
// ./actions.ts returns exactly these shapes, and ./api.ts exposes them
// through the same ApiRequest and ApiResponse helper types the client
// has always used.

import type { DomainKey } from "../data/bank";

export type { DomainKey };

export type SessionKind = "scenario" | "chart" | "formula" | "mock";
export type QuestionKind = "scenario" | "chart" | "formula";
export type AnswerMode = "tap" | "voice";

export interface PublicQuestion {
  id: string;
  kind: QuestionKind;
  domain: DomainKey;
  format: string;
  topic: string;
  processGroup: string | null;
  scenario: string;
  stem: string;
  options: string[];
  glossaryTermIds: string[];
}

export interface DomainStat {
  key: DomainKey;
  name: string;
  weight: number;
  attempted: number;
  correct: number;
  accuracy: number | null;
}

export interface TopicStat {
  topic: string;
  domain: DomainKey;
  attempted: number;
  correct: number;
  accuracy: number | null;
  needsRestudy: boolean;
}

export interface ProcessGroupStat {
  group: string;
  attempted: number;
  correct: number;
  accuracy: number | null;
}

export interface RecentSession {
  id: number;
  kind: string;
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  completed: boolean;
  createdAt: string;
}

export interface OverviewResponse {
  totalAttempts: number;
  totalCorrect: number;
  weightedScore: number | null;
  coveredWeight: number;
  weakestDomain: DomainKey | null;
  domains: DomainStat[];
  topics: TopicStat[];
  processGroups: ProcessGroupStat[];
  recentSessions: RecentSession[];
  scenarioBankSize: number;
  chartBankSize: number;
  formulaBankSize: number;
  mockBankSize: number;
}

export interface BankAuditDomain {
  key: DomainKey;
  name: string;
  targetWeight: number;
  count: number;
  share: number;
  targetCount: number;
  shortfall: number;
  prePackCount: number;
  prePackShare: number;
  afterWeekFourCount: number;
  afterWeekFourShare: number;
  afterWeekFiveCount: number;
  afterWeekFiveShare: number;
}

export interface BankAuditResponse {
  totalQuestions: number;
  prePackTotal: number;
  weekFourSize: number;
  afterWeekFourTotal: number;
  weekFiveSize: number;
  afterWeekFiveTotal: number;
  weekSixSize: number;
  peopleShortfallPrePack: number;
  peopleShortfallNow: number;
  domains: BankAuditDomain[];
}

export interface GlossaryTermPublic {
  id: string;
  term: string;
  domain: DomainKey;
  processGroup: string | null;
  definition: string;
  confusedWith: string | null;
  trapNote: string | null;
}

export interface GlossaryResponse {
  terms: GlossaryTermPublic[];
}

export interface StartSessionRequest {
  kind: SessionKind;
  size?: number;
}

export interface SessionMixEntry {
  key: DomainKey;
  name: string;
  weight: number;
  count: number;
}

export interface StartSessionResponse {
  sessionId: number;
  kind: SessionKind;
  durationSeconds: number;
  mix: SessionMixEntry[];
  questions: PublicQuestion[];
}

export interface SubmitAnswerRequest {
  sessionId: number;
  questionId: string;
  chosenIndex: number;
  answerMode: AnswerMode;
}

export interface SubmitAnswerResponse {
  correct: boolean;
  correctIndex: number;
  explanation: string;
  trap: string;
  topic: string;
  glossaryTermIds: string[];
  deferred: boolean;
}

export interface FinishSessionRequest {
  sessionId: number;
}

export interface ReviewEntry {
  questionId: string;
  kind: string;
  domain: DomainKey;
  topic: string;
  processGroup: string | null;
  scenario: string;
  stem: string;
  options: string[];
  chosenIndex: number;
  correctIndex: number;
  correct: boolean;
  explanation: string;
  trap: string;
  glossaryTermIds: string[];
}

export interface FinishSessionResponse {
  sessionId: number;
  kind: string;
  answered: number;
  correct: number;
  domains: DomainStat[];
  weightedScore: number | null;
  coveredWeight: number;
  weakestTopic: string | null;
  totalQuestions: number;
  processGroups: ProcessGroupStat[];
  review: ReviewEntry[];
}

export interface ResetProgressResponse {
  ok: true;
}
