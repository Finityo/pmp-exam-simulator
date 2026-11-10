import { defineAction, z, type ActionsModule, type Ctx } from "@hatch/space-sdk";
import { desc, eq } from "drizzle-orm";
import * as schema from "./schema";
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
} from "./bank";
import { GLOSSARY_TERMS, glossaryTermsInText } from "./glossary";

const domainKey = z.enum(["people", "process", "business"]);

const publicQuestion = z.object({
  id: z.string(),
  kind: z.enum(["scenario", "chart", "formula"]),
  domain: domainKey,
  format: z.string(),
  topic: z.string(),
  processGroup: z.string().nullable(),
  scenario: z.string(),
  stem: z.string(),
  options: z.array(z.string()),
  glossaryTermIds: z.array(z.string()),
});

type PublicQuestion = z.infer<typeof publicQuestion>;

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

const overviewResponse = z.object({
  totalAttempts: z.number(),
  totalCorrect: z.number(),
  weightedScore: z.number().nullable(),
  coveredWeight: z.number(),
  weakestDomain: domainKey.nullable(),
  domains: z.array(
    z.object({
      key: domainKey,
      name: z.string(),
      weight: z.number(),
      attempted: z.number(),
      correct: z.number(),
      accuracy: z.number().nullable(),
    }),
  ),
  topics: z.array(
    z.object({
      topic: z.string(),
      domain: domainKey,
      attempted: z.number(),
      correct: z.number(),
      accuracy: z.number().nullable(),
      needsRestudy: z.boolean(),
    }),
  ),
  processGroups: z.array(
    z.object({
      group: z.string(),
      attempted: z.number(),
      correct: z.number(),
      accuracy: z.number().nullable(),
    }),
  ),
  recentSessions: z.array(
    z.object({
      id: z.number(),
      kind: z.string(),
      totalQuestions: z.number(),
      answeredCount: z.number(),
      correctCount: z.number(),
      completed: z.boolean(),
      createdAt: z.string(),
    }),
  ),
  scenarioBankSize: z.number(),
  chartBankSize: z.number(),
  formulaBankSize: z.number(),
  mockBankSize: z.number(),
});

type OverviewResponse = z.infer<typeof overviewResponse>;

async function buildOverview(ctx: Ctx): Promise<OverviewResponse> {
  const db = ctx.db<typeof schema>();
  const rows = await db.select().from(schema.attempts);
  const domainStats = new Map<string, StatAcc>();
  const topicStats = new Map<
    string,
    StatAcc & { domain: DomainKey }
  >();
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
      domain: r.domain as DomainKey,
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
  const sessionRows = await db
    .select()
    .from(schema.sessions)
    .orderBy(desc(schema.sessions.id))
    .limit(8);
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
      createdAt: s.createdAt.toISOString(),
    })),
    scenarioBankSize: ALL_SCENARIO_QUESTIONS.length,
    chartBankSize: CHART_QUESTIONS.length,
    formulaBankSize: FORMULA_QUESTIONS.length,
    mockBankSize: ALL_QUESTIONS.length,
  };
}

const bankAuditResponse = z.object({
  totalQuestions: z.number(),
  prePackTotal: z.number(),
  weekFourSize: z.number(),
  afterWeekFourTotal: z.number(),
  weekFiveSize: z.number(),
  afterWeekFiveTotal: z.number(),
  weekSixSize: z.number(),
  peopleShortfallPrePack: z.number(),
  peopleShortfallNow: z.number(),
  domains: z.array(
    z.object({
      key: domainKey,
      name: z.string(),
      targetWeight: z.number(),
      count: z.number(),
      share: z.number(),
      targetCount: z.number(),
      shortfall: z.number(),
      prePackCount: z.number(),
      prePackShare: z.number(),
      afterWeekFourCount: z.number(),
      afterWeekFourShare: z.number(),
      afterWeekFiveCount: z.number(),
      afterWeekFiveShare: z.number(),
    }),
  ),
});

type BankAuditResponse = z.infer<typeof bankAuditResponse>;

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

export const Actions = {
  getOverview: defineAction({
    description: "Returns the learner's all time progress: weighted score, per domain accuracy, topic and process group breakdowns, and recent sessions.",
    request: z.object({}),
    response: overviewResponse,
    async handler(ctx): Promise<OverviewResponse> {
      return buildOverview(ctx);
    },
  }),

  getBankAudit: defineAction({
    description: "Returns the question bank composition audit, computed from the bank itself: per domain counts and shares against the July 2026 blueprint targets, before the Week 4 pack, after Week 4, after Week 5, and with the Week 6 expansion pack included.",
    request: z.object({}),
    response: bankAuditResponse,
    async handler(): Promise<BankAuditResponse> {
      return buildBankAudit();
    },
  }),

  getGlossary: defineAction({
    description: "Returns the full glossary of PMP terms with plain language definitions, domains, process groups, confused pair flags, and exam trap notes.",
    request: z.object({}),
    response: z.object({
      terms: z.array(
        z.object({
          id: z.string(),
          term: z.string(),
          domain: domainKey,
          processGroup: z.string().nullable(),
          definition: z.string(),
          confusedWith: z.string().nullable(),
          trapNote: z.string().nullable(),
        }),
      ),
    }),
    async handler() {
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
    },
  }),

  startSession: defineAction({
    description: "Starts a practice session or timed mock exam of the requested kind and size, and returns its questions without answers.",
    request: z.object({
      kind: z.enum(["scenario", "chart", "formula", "mock"]),
      size: z.number().int().min(5).max(180).default(10),
    }),
    response: z.object({
      sessionId: z.number(),
      kind: z.enum(["scenario", "chart", "formula", "mock"]),
      durationSeconds: z.number(),
      mix: z.array(
        z.object({ key: domainKey, name: z.string(), weight: z.number(), count: z.number() }),
      ),
      questions: z.array(publicQuestion),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
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
        const size = Math.min(args.size, total);
        const scenarioTarget = Math.round(
          (size * ALL_SCENARIO_QUESTIONS.length) / total,
        );
        const formulaTarget = Math.round((size * FORMULA_QUESTIONS.length) / total);
        const chartTarget = Math.max(0, size - scenarioTarget - formulaTarget);
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
        const alloc = allocationForSize(args.size);
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
      const inserted = await db
        .insert(schema.sessions)
        .values({ kind: args.kind, totalQuestions: picked.length })
        .returning({ id: schema.sessions.id });
      const row = inserted[0];
      if (!row) throw new Error("startSession: insert returned no rows");
      ctx.invalidateQueries();
      return {
        sessionId: row.id,
        kind: args.kind,
        durationSeconds:
          args.kind === "mock" ? Math.round((picked.length * 230 * 60) / 180) : 0,
        mix,
        questions: picked.map(toPublic),
      };
    },
  }),

  submitAnswer: defineAction({
    description: "Records one answer in a session and returns whether it was correct with the explanation and exam trap, deferred until the end for mock exams.",
    request: z.object({
      sessionId: z.number().int().positive(),
      questionId: z.string().min(1),
      chosenIndex: z.number().int().min(0).max(3),
      answerMode: z.enum(["tap", "voice"]),
    }),
    response: z.object({
      correct: z.boolean(),
      correctIndex: z.number(),
      explanation: z.string(),
      trap: z.string(),
      topic: z.string(),
      glossaryTermIds: z.array(z.string()),
      deferred: z.boolean(),
    }),
    async handler(ctx, args) {
      const q = findQuestion(args.questionId);
      if (!q) throw new Error("Unknown question");
      const db = ctx.db<typeof schema>();
      const isCorrect = args.chosenIndex === q.correct;
      const preRows = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, args.sessionId));
      const preSess = preRows[0];
      // Mock exam conditions: answers are recorded, but no correctness,
      // correct answer, or explanation is revealed until the exam is
      // finished. finishSession returns the full review at the end.
      const deferred =
        preSess?.kind === "mock" && preSess.completedAt === null;
      await db.insert(schema.attempts).values({
        sessionId: args.sessionId,
        questionId: q.id,
        kind: q.kind,
        domain: q.domain,
        topic: q.topic,
        processGroup: q.processGroup,
        chosenIndex: args.chosenIndex,
        isCorrect: isCorrect ? 1 : 0,
        answerMode: args.answerMode,
      });
      const sessionRows = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, args.sessionId));
      const sess = sessionRows[0];
      if (sess) {
        await db
          .update(schema.sessions)
          .set({
            answeredCount: sess.answeredCount + 1,
            correctCount: sess.correctCount + (isCorrect ? 1 : 0),
          })
          .where(eq(schema.sessions.id, args.sessionId));
      }
      ctx.invalidateQueries();
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
    },
  }),

  finishSession: defineAction({
    description: "Marks a session complete and returns its scores by domain and process group, plus the full per question review for mock exams.",
    request: z.object({ sessionId: z.number().int().positive() }),
    response: z.object({
      sessionId: z.number(),
      kind: z.string(),
      answered: z.number(),
      correct: z.number(),
      domains: z.array(
        z.object({
          key: domainKey,
          name: z.string(),
          weight: z.number(),
          attempted: z.number(),
          correct: z.number(),
          accuracy: z.number().nullable(),
        }),
      ),
      weightedScore: z.number().nullable(),
      coveredWeight: z.number(),
      weakestTopic: z.string().nullable(),
      totalQuestions: z.number(),
      processGroups: z.array(
        z.object({
          group: z.string(),
          attempted: z.number(),
          correct: z.number(),
          accuracy: z.number().nullable(),
        }),
      ),
      review: z.array(
        z.object({
          questionId: z.string(),
          kind: z.string(),
          domain: domainKey,
          topic: z.string(),
          processGroup: z.string().nullable(),
          scenario: z.string(),
          stem: z.string(),
          options: z.array(z.string()),
          chosenIndex: z.number(),
          correctIndex: z.number(),
          correct: z.boolean(),
          explanation: z.string(),
          trap: z.string(),
          glossaryTermIds: z.array(z.string()),
        }),
      ),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db
        .update(schema.sessions)
        .set({ completedAt: new Date() })
        .where(eq(schema.sessions.id, args.sessionId));
      const rows = await db
        .select()
        .from(schema.attempts)
        .where(eq(schema.attempts.sessionId, args.sessionId));
      const sessRows = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, args.sessionId));
      const sessionKind = sessRows[0]?.kind ?? "scenario";
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
      ctx.invalidateQueries();
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
        totalQuestions: sessRows[0]?.totalQuestions ?? rows.length,
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
    },
  }),

  resetProgress: defineAction({
    description: "Erases all saved sessions and attempts so progress tracking starts over.",
    request: z.object({}),
    response: z.object({ ok: z.literal(true) }),
    handler: async (ctx): Promise<{ ok: true }> => {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.attempts);
      await db.delete(schema.sessions);
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),
} satisfies ActionsModule;
