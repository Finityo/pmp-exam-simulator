import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["scenario", "chart", "formula", "mock"] }).notNull(),
  totalQuestions: integer("total_questions").notNull(),
  answeredCount: integer("answered_count").notNull().default(0),
  correctCount: integer("correct_count").notNull().default(0),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const attempts = sqliteTable("attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull(),
  questionId: text("question_id").notNull(),
  kind: text("kind", { enum: ["scenario", "chart", "formula", "mock"] }).notNull(),
  domain: text("domain", { enum: ["people", "process", "business"] }).notNull(),
  topic: text("topic").notNull(),
  processGroup: text("process_group"),
  chosenIndex: integer("chosen_index").notNull(),
  isCorrect: integer("is_correct").notNull(),
  answerMode: text("answer_mode", { enum: ["tap", "voice"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
