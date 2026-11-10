// Ported action logic for the standalone build.
//
// Every handler below is the original server action, moved into the
// client with its logic, scoring, weighting, and session building kept
// line for line where the runtime allows. The differences are only at
// the edges:
//   - Database reads and writes go to the localStorage store in
//     ./store.ts, which keeps the same session and attempt row shapes
//     the server schema used.
//   - The server side query invalidation hook becomes a call to
//     invalidateQueries() on the app's shared QueryClient, at the same
//     points the original called it.
//   - Request validation that the server framework did with schemas is
//     covered by the TypeScript types in ./types.ts plus the same
//     defaults (session size defaults to 10).

import {
  ALL_QUESTIONS,
  ALL_SCENARIO_QUESTIONS,
  CHART_QUESTIONS,
  FORMULA_QUESTIONS,
  WEEK_FOUR_QUESTIONS,
  WEEK_FIVE_QUESTIONS,
  WEEK_SIX_QUESTIONS,
  DOMAINS,
  PROCESS_GROUPS,
  allocationForSize,
  findQuestion,
  type BankQuestion,
  type DomainKey,
} from "../data/bank";
import { GLOSSARY_TERMS, glossaryTermsInText } from "../data/glossary";
import { queryClient } from "../queryClient";
import { loadStore, saveStore, type AttemptRow, type SessionRow } from "./store";
import type {
  BankAuditResponse,
  FinishSessionRequest,
  FinishSessionResponse,
  GlossaryResponse,
  OverviewResponse,
  PublicQuestion,
  ResetProgressResponse,
  StartSessionRequest,
  StartSessionResponse,
  SubmitAnswerRequest,
  SubmitAnswerResponse,
} from "./types";

function toPublic(q: BankQuestion): PublicQuestion {
  return {
    id: q.id,
    kind: q.kind,
    domain: q.domain,
    format: q.format,
    topic: q.topic,
    processGroup: q.processGroup,
    scenario: q.scenario,
    stem: q.stem,
    options: q.options,
    glossaryTermIds: glossaryTermsInText(
      [q.scenario, q.stem, ...q.options].join(" "),
    ),
  };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j] as T;
    a[j] = tmp as T;
  }
  return a;
}

interface StatAcc {
  attempted: number;
  correct: number;
}

function accuracy(acc: StatAcc | undefined): number | null {
  if (!acc || acc.attempted === 0) return null;
  return Math.round((acc.correct / acc.attempted) * 100);
}

function weightedScore(
  stats: Map<string, StatAcc>,
): { score: number | null; coveredWeight: number } {
  let weighted = 0;
  let covered = 0;
  for (const d of DOMAINS) {
    const acc = stats.get(d.key);
    const a = accuracy(acc);
    if (a !== null) {
      weighted += (a * d.weight) / 100;
      covered += d.weight;
    }
  }
  if (covered === 0) return { score: null, coveredWeight: 0 };
  return { score: Math.round((weighted / covered) * 100), coveredWeight: covered };
}

function buildOverview(): OverviewResponse {
  const store = loadStore();
  const rows = store.attempts;
  const domainStats = new Map<string, StatAcc>();
  const topicStats = new Map<string, StatAcc & { domain: DomainKey }>();
  const groupStats = new Map<string, StatAcc>();
  let totalCorrect = 0;
  for (const r of rows) {
    if (r.isCorrect === 1) totalCorrect += 1;
    const d = domainStats.get(r.domain) ?? { attempted: 0, correct: 0 };
    d.attempted += 1;
    if (r.isCorrect === 1) d.correct += 1;
    domainStats.set(r.domain, d);
    const t = topicStats.get(r.topic) ?? {
      attempted: 0,
      correct: 0,
      domain: r.domain,
    };
    t.attempted += 1;
    if (r.isCorrect === 1) t.correct += 1;
    topicStats.set(r.topic, t);
    if (r.processGroup) {
      const g = groupStats.get(r.processGroup) ?? { attempted: 0, correct: 0 };
      g.attempted += 1;
      if (r.isCorrect === 1) g.correct += 1;
      groupStats.set(r.processGroup, g);
    }
  }
  const w = weightedScore(domainStats);
  let weakest: DomainKey | null = null;
  let weakestAcc = Infinity;
  const domains = DOMAINS.map((d) => {
    const acc = domainStats.get(d.key);
    const a = accuracy(acc);
    if (a !== null && a < weakestAcc) {
      weakestAcc = a;
      weakest = d.key;
    }
    return {
      key: d.key,
      name: d.name,
      weight: d.weight,
      attempted: acc?.attempted ?? 0,
      correct: acc?.correct ?? 0,
      accuracy: a,
    };
  });
  const topics = [...topicStats.entries()]
    .map(([topic, acc]) => {
      const a = accuracy(acc);
      return {
        topic,
        domain: acc.domain,
        attempted: acc.attempted,
        correct: acc.correct,
        accuracy: a,
        needsRestudy: a !== null && acc.attempted >= 2 && a < 70,
      };
    })
    .sort((x, y) => (x.accuracy ?? 101) - (y.accuracy ?? 101));
  const processGroups = PROCESS_GROUPS.map((g) => {
    const acc = groupStats.get(g);
    return {
      group: g,
      attempted: acc?.attempted ?? 0,
      correct: acc?.correct ?? 0,
      accuracy: accuracy(acc),
    };
  });
  const sessionRows = [...store.sessions]
    .sort((a, b) => b.id - a.id)
    .slice(0, 8);
  return {
    totalAttempts: rows.length,
    totalCorrect,
    weightedScore: w.score,
    coveredWeight: w.coveredWeight,
    weakestDomain: weakest,
    domains,
    topics,
    processGroups,
    recentSessions: sessionRows.map((s) => ({
      id: s.id,
      kind: s.kind,
      totalQuestions: s.totalQuestions,
      answeredCount: s.answeredCount,
      correctCount: s.correctCount,
      completed: s.completedAt !== null,
      createdAt: s.createdAt,
    })),
    scenarioBankSize: ALL_SCENARIO_QUESTIONS.length,
    chartBankSize: CHART_QUESTIONS.length,
    formulaBankSize: FORMULA_QUESTIONS.length,
    mockBankSize: ALL_QUESTIONS.length,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function buildBankAudit(): BankAuditResponse {
  const total = ALL_QUESTIONS.length;
  const weekFourSize = WEEK_FOUR_QUESTIONS.length;
  const weekFiveSize = WEEK_FIVE_QUESTIONS.length;
  const weekSixSize = WEEK_SIX_QUESTIONS.length;
  const afterWeekFiveTotal = total - weekSixSize;
  const afterWeekFourTotal = afterWeekFiveTotal - weekFiveSize;
  const prePackTotal = afterWeekFourTotal - weekFourSize;
  const weekFourCounts = new Map<string, number>();
  for (const q of WEEK_FOUR_QUESTIONS) {
    weekFourCounts.set(q.domain, (weekFourCounts.get(q.domain) ?? 0) + 1);
  }
  const weekFiveCounts = new Map<string, number>();
  for (const q of WEEK_FIVE_QUESTIONS) {
    weekFiveCounts.set(q.domain, (weekFiveCounts.get(q.domain) ?? 0) + 1);
  }
  const weekSixCounts = new Map<string, number>();
  for (const q of WEEK_SIX_QUESTIONS) {
    weekSixCounts.set(q.domain, (weekSixCounts.get(q.domain) ?? 0) + 1);
  }
  const counts = new Map<string, number>();
  for (const q of ALL_QUESTIONS) {
    counts.set(q.domain, (counts.get(q.domain) ?? 0) + 1);
  }
  const domains = DOMAINS.map((d) => {
    const count = counts.get(d.key) ?? 0;
    const afterWeekFiveCount = count - (weekSixCounts.get(d.key) ?? 0);
    const afterWeekFourCount = afterWeekFiveCount - (weekFiveCounts.get(d.key) ?? 0);
    const prePackCount = afterWeekFourCount - (weekFourCounts.get(d.key) ?? 0);
    const targetCount = (total * d.weight) / 100;
    const preTargetCount = (prePackTotal * d.weight) / 100;
    return {
      key: d.key,
      name: d.name,
      targetWeight: d.weight,
      count,
      share: total === 0 ? 0 : round1((count / total) * 100),
      targetCount: round1(targetCount),
      shortfall: round1(Math.max(0, targetCount - count)),
      prePackCount,
      prePackShare:
        prePackTotal === 0 ? 0 : round1((prePackCount / prePackTotal) * 100),
      afterWeekFourCount,
      afterWeekFourShare:
        afterWeekFourTotal === 0
          ? 0
          : round1((afterWeekFourCount / afterWeekFourTotal) * 100),
      afterWeekFiveCount,
      afterWeekFiveShare:
        afterWeekFiveTotal === 0
          ? 0
          : round1((afterWeekFiveCount / afterWeekFiveTotal) * 100),
      prePackShortfall: round1(Math.max(0, preTargetCount - prePackCount)),
    };
  });
  const people = domains.find((d) => d.key === "people");
  return {
    totalQuestions: total,
    prePackTotal,
    weekFourSize,
    afterWeekFourTotal,
    weekFiveSize,
    afterWeekFiveTotal,
    weekSixSize,
    peopleShortfallPrePack: people ? people.prePackShortfall : 0,
    peopleShortfallNow: people ? people.shortfall : 0,
    domains: domains.map(({ prePackShortfall: _omit, ...rest }) => rest),
  };
}

async function getOverview(_args: Record<string, never>): Promise<OverviewResponse> {
  return buildOverview();
}

async function getBankAudit(
  _args: Record<string, never>,
): Promise<BankAuditResponse> {
  return buildBankAudit();
}

async function getGlossary(
  _args: Record<string, never>,
): Promise<GlossaryResponse> {
  return {
    terms: GLOSSARY_TERMS.map((t) => ({
      id: t.id,
      term: t.term,
      domain: t.domain,
      processGroup: t.processGroup,
      definition: t.definition,
      confusedWith: t.confusedWith,
      trapNote: t.trapNote,
    })),
  };
}

async function startSession(
  args: StartSessionRequest,
): Promise<StartSessionResponse> {
  const size = args.size ?? 10;
  let picked: BankQuestion[] = [];
  let mix: { key: DomainKey; name: string; weight: number; count: number }[] = [];
  if (args.kind === "chart") {
    picked = [...CHART_QUESTIONS];
    mix = [{ key: "process", name: "Process", weight: 41, count: picked.length }];
  } else if (args.kind === "formula") {
    picked = [...FORMULA_QUESTIONS];
    mix = [{ key: "process", name: "Process", weight: 41, count: picked.length }];
  } else if (args.kind === "mock") {
    // Mock exam: draw from the whole bank in bank proportions, with the
    // scenario share stratified at the July 2026 domain weights. The
    // clock uses real PMP pacing: 230 minutes for 180 questions.
    const total = ALL_QUESTIONS.length;
    const cappedSize = Math.min(size, total);
    const scenarioTarget = Math.round(
      (cappedSize * ALL_SCENARIO_QUESTIONS.length) / total,
    );
    const formulaTarget = Math.round((cappedSize * FORMULA_QUESTIONS.length) / total);
    const chartTarget = Math.max(0, cappedSize - scenarioTarget - formulaTarget);
    const alloc = allocationForSize(scenarioTarget);
    const byDomain = new Map<DomainKey, BankQuestion[]>();
    for (const q of ALL_SCENARIO_QUESTIONS) {
      const list = byDomain.get(q.domain) ?? [];
      list.push(q);
      byDomain.set(q.domain, list);
    }
    const domainCounts = new Map<DomainKey, number>();
    for (const d of DOMAINS) {
      const pool = shuffle(byDomain.get(d.key) ?? []);
      const take = Math.min(alloc[d.key], pool.length);
      picked.push(...pool.slice(0, take));
      domainCounts.set(d.key, take);
    }
    const formulaPicked = shuffle(FORMULA_QUESTIONS).slice(0, formulaTarget);
    const chartPicked = shuffle(CHART_QUESTIONS).slice(0, chartTarget);
    picked.push(...formulaPicked, ...chartPicked);
    domainCounts.set(
      "process",
      (domainCounts.get("process") ?? 0) + formulaPicked.length + chartPicked.length,
    );
    picked = shuffle(picked);
    mix = DOMAINS.map((d) => ({
      key: d.key,
      name: d.name,
      weight: d.weight,
      count: domainCounts.get(d.key) ?? 0,
    }));
  } else {
    const alloc = allocationForSize(size);
    const byDomain = new Map<DomainKey, BankQuestion[]>();
    for (const q of ALL_SCENARIO_QUESTIONS) {
      const list = byDomain.get(q.domain) ?? [];
      list.push(q);
      byDomain.set(q.domain, list);
    }
    for (const d of DOMAINS) {
      const pool = shuffle(byDomain.get(d.key) ?? []);
      const take = Math.min(alloc[d.key], pool.length);
      picked.push(...pool.slice(0, take));
      mix.push({ key: d.key, name: d.name, weight: d.weight, count: take });
    }
    picked = shuffle(picked);
  }
  const store = loadStore();
  const row: SessionRow = {
    id: store.nextSessionId,
    kind: args.kind,
    totalQuestions: picked.length,
    answeredCount: 0,
    correctCount: 0,
    completedAt: null,
    createdAt: new Date().toISOString(),
  };
  store.nextSessionId += 1;
  store.sessions.push(row);
  saveStore(store);
  void queryClient.invalidateQueries();
  return {
    sessionId: row.id,
    kind: args.kind,
    durationSeconds:
      args.kind === "mock" ? Math.round((picked.length * 230 * 60) / 180) : 0,
    mix,
    questions: picked.map(toPublic),
  };
}

async function submitAnswer(
  args: SubmitAnswerRequest,
): Promise<SubmitAnswerResponse> {
  const q = findQuestion(args.questionId);
  if (!q) throw new Error("Unknown question");
  const store = loadStore();
  const isCorrect = args.chosenIndex === q.correct;
  const preSess = store.sessions.find((s) => s.id === args.sessionId);
  // Mock exam conditions: answers are recorded, but no correctness,
  // correct answer, or explanation is revealed until the exam is
  // finished. finishSession returns the full review at the end.
  const deferred = preSess?.kind === "mock" && preSess.completedAt === null;
  const attempt: AttemptRow = {
    id: store.nextAttemptId,
    sessionId: args.sessionId,
    questionId: q.id,
    kind: q.kind,
    domain: q.domain,
    topic: q.topic,
    processGroup: q.processGroup,
    chosenIndex: args.chosenIndex,
    isCorrect: isCorrect ? 1 : 0,
    answerMode: args.answerMode,
    createdAt: new Date().toISOString(),
  };
  store.nextAttemptId += 1;
  store.attempts.push(attempt);
  const sess = store.sessions.find((s) => s.id === args.sessionId);
  if (sess) {
    sess.answeredCount += 1;
    sess.correctCount += isCorrect ? 1 : 0;
  }
  saveStore(store);
  void queryClient.invalidateQueries();
  if (deferred) {
    return {
      correct: false,
      correctIndex: -1,
      explanation: "",
      trap: "",
      topic: q.topic,
      glossaryTermIds: [],
      deferred: true,
    };
  }
  return {
    correct: isCorrect,
    correctIndex: q.correct,
    explanation: q.explanation,
    trap: q.trap,
    topic: q.topic,
    glossaryTermIds: glossaryTermsInText(`${q.explanation} ${q.trap}`),
    deferred: false,
  };
}

async function finishSession(
  args: FinishSessionRequest,
): Promise<FinishSessionResponse> {
  const store = loadStore();
  const sessRow = store.sessions.find((s) => s.id === args.sessionId);
  if (sessRow) {
    sessRow.completedAt = new Date().toISOString();
  }
  const rows = store.attempts.filter((a) => a.sessionId === args.sessionId);
  const sessionKind = sessRow?.kind ?? "scenario";
  const domainStats = new Map<string, StatAcc>();
  const topicStats = new Map<string, StatAcc>();
  const groupStats = new Map<string, StatAcc>();
  for (const r of rows) {
    const d = domainStats.get(r.domain) ?? { attempted: 0, correct: 0 };
    d.attempted += 1;
    if (r.isCorrect === 1) d.correct += 1;
    domainStats.set(r.domain, d);
    const t = topicStats.get(r.topic) ?? { attempted: 0, correct: 0 };
    t.attempted += 1;
    if (r.isCorrect === 1) t.correct += 1;
    topicStats.set(r.topic, t);
    if (r.processGroup) {
      const g = groupStats.get(r.processGroup) ?? { attempted: 0, correct: 0 };
      g.attempted += 1;
      if (r.isCorrect === 1) g.correct += 1;
      groupStats.set(r.processGroup, g);
    }
  }
  const w = weightedScore(domainStats);
  let weakestTopic: string | null = null;
  let weakestAcc = Infinity;
  for (const [topic, acc] of topicStats.entries()) {
    const a = accuracy(acc);
    if (a !== null && a < weakestAcc) {
      weakestAcc = a;
      weakestTopic = topic;
    }
  }
  // The per question review, with explanations, is built only for a
  // mock exam, and only now that the exam is finished. Practice sets
  // already saw each explanation as they went.
  const review =
    sessionKind === "mock"
      ? rows.flatMap((r) => {
          const q = findQuestion(r.questionId);
          if (!q) return [];
          return [
            {
              questionId: q.id,
              kind: q.kind,
              domain: q.domain,
              topic: q.topic,
              processGroup: q.processGroup,
              scenario: q.scenario,
              stem: q.stem,
              options: q.options,
              chosenIndex: r.chosenIndex,
              correctIndex: q.correct,
              correct: r.isCorrect === 1,
              explanation: q.explanation,
              trap: q.trap,
              glossaryTermIds: glossaryTermsInText(
                `${q.explanation} ${q.trap}`,
              ),
            },
          ];
        })
      : [];
  saveStore(store);
  void queryClient.invalidateQueries();
  return {
    sessionId: args.sessionId,
    kind: sessionKind,
    answered: rows.length,
    correct: rows.filter((r) => r.isCorrect === 1).length,
    domains: DOMAINS.map((d) => {
      const acc = domainStats.get(d.key);
      return {
        key: d.key,
        name: d.name,
        weight: d.weight,
        attempted: acc?.attempted ?? 0,
        correct: acc?.correct ?? 0,
        accuracy: accuracy(acc),
      };
    }),
    weightedScore: w.score,
    coveredWeight: w.coveredWeight,
    weakestTopic,
    totalQuestions: sessRow?.totalQuestions ?? rows.length,
    processGroups: PROCESS_GROUPS.map((g) => {
      const acc = groupStats.get(g);
      return {
        group: g,
        attempted: acc?.attempted ?? 0,
        correct: acc?.correct ?? 0,
        accuracy: accuracy(acc),
      };
    }),
    review,
  };
}

async function resetProgress(
  _args: Record<string, never>,
): Promise<ResetProgressResponse> {
  const store = loadStore();
  store.attempts = [];
  store.sessions = [];
  saveStore(store);
  void queryClient.invalidateQueries();
  return { ok: true };
}

export const localActions = {
  getOverview,
  getBankAudit,
  getGlossary,
  startSession,
  submitAnswer,
  finishSession,
  resetProgress,
};

export type LocalActions = typeof localActions;
