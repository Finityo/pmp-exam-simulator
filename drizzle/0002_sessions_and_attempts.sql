DROP TABLE entries;
--> statement-breakpoint
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  total_questions INTEGER NOT NULL,
  answered_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  domain TEXT NOT NULL,
  topic TEXT NOT NULL,
  process_group TEXT,
  chosen_index INTEGER NOT NULL,
  is_correct INTEGER NOT NULL,
  answer_mode TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
